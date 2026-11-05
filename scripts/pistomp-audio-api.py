#!/usr/bin/env python3
"""HTTP ALSA controls for Pistomp-Mobile — uses pi-stomp audiocard when available."""
from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

HOST = "127.0.0.1"
PORT = 8766
CARD = 0
# pi-stomp source tree. pistompOS 3.x installs it to /opt/pistomp/pi-stomp
# (with /home/pistomp/pi-stomp as a symlink); older images had a git checkout
# in /home/pistomp/pi-stomp. PI_STOMP_HOME overrides.
_PI_STOMP_CANDIDATES = [
    os.environ.get("PI_STOMP_HOME") or "",
    "/opt/pistomp/pi-stomp",
    "/home/pistomp/pi-stomp",
]
PI_STOMP_HOME = next((p for p in _PI_STOMP_CANDIDATES if p and os.path.isdir(p)), "")
# How often to let pi-stomp's audiocard flush its debounced `alsactl store`.
STORE_POLL_S = 0.25
# Same path pi-stomp audiocard.py uses (not a Pistomp-Mobile–specific file).
ASOUND_STATE = "/var/lib/alsa/asound.state"

# Allow importing jack_vu_meter.py from the same install dir (/opt/pistomp-mobile).
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

try:
    from jack_vu_meter import get_shared_meter
except Exception as _vu_exc:  # pragma: no cover
    get_shared_meter = None  # type: ignore
    sys.stderr.write(f"pistomp-audio-api: jack vu unavailable ({_vu_exc})\n")

DEFAULT_CONTROLS = [
    ("Aux", "Input gain"),
    ("Headphone", "Output volume"),
    ("DAC EQ", "DAC EQ"),
    ("DAC EQ1", "EQ band 1"),
    ("DAC EQ2", "EQ band 2"),
    ("DAC EQ3", "EQ band 3"),
    ("DAC EQ4", "EQ band 4"),
    ("DAC EQ5", "EQ band 5"),
]

_audiocard = None
_audiocard_tried = False
# "pistomp" when pi-stomp's audiocard is driving ALSA, else "amixer".
_backend = "amixer"
_backend_detail = "not initialised"
# Serialises card calls between HTTP requests and the store-poll thread.
_card_lock = threading.RLock()


def _run(cmd: str) -> str:
    return subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.STDOUT)


def _get_audiocard():
    """pi-stomp's own audiocard (same control names and persistence as the LCD menu)."""
    global _audiocard, _audiocard_tried, _backend, _backend_detail
    with _card_lock:
        if _audiocard_tried:
            return _audiocard
        _audiocard_tried = True
        if not PI_STOMP_HOME:
            _backend_detail = "pi-stomp not found in " + ", ".join(p for p in _PI_STOMP_CANDIDATES if p)
            sys.stderr.write(f"pistomp-audio-api: amixer fallback ({_backend_detail})\n")
            return None
        try:
            if PI_STOMP_HOME not in sys.path:
                sys.path.insert(0, PI_STOMP_HOME)
            from pistomp.audiocardfactory import Audiocardfactory

            _audiocard = Audiocardfactory(PI_STOMP_HOME).create()
            _backend = "pistomp"
            _backend_detail = f"{type(_audiocard).__name__} from {PI_STOMP_HOME}"
            sys.stderr.write(f"pistomp-audio-api: using pi-stomp audiocard {_backend_detail}\n")
        except Exception as exc:
            _audiocard = None
            _backend_detail = f"{type(exc).__name__}: {exc}"
            sys.stderr.write(f"pistomp-audio-api: amixer fallback ({_backend_detail})\n")
        return _audiocard


def _store_alsa_state() -> None:
    """Persist like pi-stomp System menu (audiocard.store)."""
    card = _get_audiocard()
    if card is not None:
        try:
            with _card_lock:
                card.store()
            return
        except Exception:
            pass
    try:
        # asound.state is root-owned; the service runs as pistomp (passwordless
        # sudo on pistompOS). -n: never hang on a password prompt.
        subprocess.run(
            ["sudo", "-n", "/usr/sbin/alsactl", "-f", ASOUND_STATE, "store"],
            stderr=subprocess.DEVNULL,
            check=False,
        )
    except Exception:
        pass


def _store_poll_loop() -> None:
    """Drive pi-stomp's debounced store, like modalapistomp's main loop does.

    pistompOS 3.3+ audiocards only *schedule* `alsactl store` on a set; it runs
    when poll_store() is called after the settle delay. Older audiocards store
    immediately and have no poll_store, so this is a no-op there.
    """
    while True:
        time.sleep(STORE_POLL_S)
        card = _audiocard
        poll = getattr(card, "poll_store", None)
        if poll is None:
            continue
        try:
            with _card_lock:
                poll()
        except Exception as exc:
            sys.stderr.write(f"pistomp-audio-api: poll_store failed ({exc})\n")


def _flush_pending_store() -> None:
    flush = getattr(_audiocard, "flush_store", None)
    if flush is None:
        return
    try:
        with _card_lock:
            flush()
    except Exception as exc:
        sys.stderr.write(f"pistomp-audio-api: flush_store failed ({exc})\n")


def _resolve_param_name(name: str) -> str:
    card = _get_audiocard()
    if card is None:
        return name
    if name in (card.CAPTURE_VOLUME, "Aux", "Capture"):
        return card.CAPTURE_VOLUME or name
    if name in (card.MASTER, "Headphone", "Master"):
        return card.MASTER or name
    for attr in ("DAC_EQ", "EQ_1", "EQ_2", "EQ_3", "EQ_4", "EQ_5"):
        val = getattr(card, attr, None)
        if val and name == val:
            return val
    return name


def list_controls() -> list[dict]:
    card = _get_audiocard()
    if card is not None:
        items: list[dict] = []
        for label, attr in (
            ("Input gain", "CAPTURE_VOLUME"),
            ("Output volume", "MASTER"),
            ("DAC EQ", "DAC_EQ"),
            ("EQ band 1", "EQ_1"),
            ("EQ band 2", "EQ_2"),
            ("EQ band 3", "EQ_3"),
            ("EQ band 4", "EQ_4"),
            ("EQ band 5", "EQ_5"),
        ):
            param = getattr(card, attr, None)
            if param:
                items.append({"name": param, "label": label})
        if items:
            return items
    try:
        out = _run(f"amixer -c {CARD} scontrols")
    except subprocess.CalledProcessError:
        return [{"name": n, "label": lbl} for n, lbl in DEFAULT_CONTROLS]
    found: list[dict] = []
    for line in out.splitlines():
        m = re.search(r"Simple mixer control '([^']+)'", line)
        if m:
            found.append({"name": m.group(1), "label": m.group(1)})
    if not found:
        return [{"name": n, "label": lbl} for n, lbl in DEFAULT_CONTROLS]
    preferred = {n: lbl for n, lbl in DEFAULT_CONTROLS}
    ordered = [c for c in found if c["name"] in preferred]
    for c in found:
        if c not in ordered:
            ordered.append(c)
    for c in ordered:
        if c["name"] in preferred:
            c["label"] = preferred[c["name"]]
    return ordered


def get_volume_db(name: str) -> dict | None:
    param = _resolve_param_name(name)
    card = _get_audiocard()
    if card is not None and param:
        try:
            with _card_lock:
                value_db = float(card.get_volume_parameter(param))
            # pi-stomp returns float dB; approximate min/max for IQaudIO
            min_db, max_db = -20.0, 12.0
            if param == card.CAPTURE_VOLUME:
                min_db, max_db = -19.75, 12.0
            return {"valueDb": round(value_db, 2), "minDb": min_db, "maxDb": max_db}
        except Exception:
            pass
    try:
        s = _run(f"amixer -c {CARD} -- sget '{param}'")
    except subprocess.CalledProcessError:
        return None
    cur = re.search(r"\[(-?\d+\.\d+)dB\]", s)
    if not cur:
        return None
    value_db = round(float(cur.group(1)), 2)
    mins = [float(x) for x in re.findall(r"(-?\d+\.\d+)dB", s)]
    if len(mins) < 2 or min(mins) >= max(mins):
        # sget prints current values only; equal channels give no range.
        return {"valueDb": value_db, "minDb": -20.0, "maxDb": 12.0}
    return {"valueDb": value_db, "minDb": min(mins), "maxDb": max(mins)}


def set_volume_db(name: str, value_db: float, store: bool = True) -> bool:
    param = _resolve_param_name(name)
    card = _get_audiocard()
    if card is not None and param:
        try:
            # store=True schedules a debounced persist; _store_poll_loop runs it.
            with _card_lock:
                ok = card.set_volume_parameter(param, value_db, store=store)
            return bool(ok)
        except Exception:
            pass
    cmd = f"amixer -c {CARD} -q -- sset '{param}' '{value_db}db'"
    try:
        subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT)
    except subprocess.CalledProcessError:
        return False
    if store:
        _store_alsa_state()
    return True


def db_to_norm(value_db: float, min_db: float, max_db: float) -> float:
    if max_db <= min_db:
        return 0.0
    return max(0.0, min(1.0, (value_db - min_db) / (max_db - min_db)))


def norm_to_db(norm: float, min_db: float, max_db: float) -> float:
    return min_db + norm * (max_db - min_db)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _json(self, code: int, body: object) -> None:
        data = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _same_origin_json_post(self) -> bool:
        """Only accept POSTs from the Pistomp-Mobile page itself.

        Requiring application/json forces a CORS preflight for any cross-site
        request, and we no longer answer preflights, so other websites open in
        the phone's browser can't trigger actions. The Origin check is a second
        guard (port ignored: nginx forwards Host without it).
        """
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if ctype != "application/json":
            self._json(415, {"ok": False, "error": "Content-Type must be application/json"})
            return False
        origin = self.headers.get("Origin")
        if origin:
            origin_host = (urlparse(origin).hostname or "").lower()
            host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]").lower()
            if origin_host not in (host, "localhost", "127.0.0.1", "::1"):
                self._json(403, {"ok": False, "error": "cross-origin request refused"})
                return False
        return True

    def do_OPTIONS(self):
        # Same-origin only: no CORS preflight approval for other sites.
        self.send_response(405)
        self.send_header("Allow", "GET, POST")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path == "/controls":
            controls = list_controls()
            self._json(
                200,
                {
                    "card": CARD,
                    "controls": controls,
                    "backend": _backend,
                    "backendDetail": _backend_detail,
                },
            )
            return
        if path == "/peaks":
            if get_shared_meter is None:
                self._json(
                    200,
                    {
                        "available": False,
                        "error": "jack vu module missing",
                        "inL": 0,
                        "inR": 0,
                        "outL": 0,
                        "outR": 0,
                    },
                )
                return
            try:
                meter = get_shared_meter()
                self._json(200, meter.snapshot())
            except Exception as exc:
                self._json(
                    200,
                    {
                        "available": False,
                        "error": str(exc),
                        "inL": 0,
                        "inR": 0,
                        "outL": 0,
                        "outR": 0,
                    },
                )
            return
        if path == "/value":
            qs = parse_qs(urlparse(self.path).query)
            name = (qs.get("control") or qs.get("name") or [None])[0]
            if not name:
                self._json(400, {"error": "control required"})
                return
            info = get_volume_db(name)
            if not info:
                self._json(404, {"error": "control not found"})
                return
            norm = db_to_norm(info["valueDb"], info["minDb"], info["maxDb"])
            self._json(
                200,
                {
                    "control": name,
                    "value": norm,
                    "valueDb": info["valueDb"],
                    "minDb": info["minDb"],
                    "maxDb": info["maxDb"],
                },
            )
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        if not self._same_origin_json_post():
            return
        if path != "/value":
            self._json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid json"})
            return
        name = body.get("control") or body.get("name")
        if not name:
            self._json(400, {"error": "control required"})
            return
        info = get_volume_db(name)
        if not info:
            self._json(404, {"error": "control not found"})
            return
        if "valueDb" in body:
            target_db = float(body["valueDb"])
        else:
            norm = float(body.get("value", 0))
            target_db = norm_to_db(norm, info["minDb"], info["maxDb"])
        ok = set_volume_db(name, round(target_db, 2), store=True)
        self._json(200 if ok else 500, {"ok": ok})


def main() -> None:
    if get_shared_meter is not None:
        try:
            get_shared_meter()  # start JACK tap early (non-fatal if JACK down)
        except Exception as exc:
            sys.stderr.write(f"pistomp-audio-api: jack vu start deferred ({exc})\n")
    _get_audiocard()  # pick the backend at startup so the log says which one
    threading.Thread(target=_store_poll_loop, name="alsa-store", daemon=True).start()

    def _on_term(_signum, _frame):
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, _on_term)
    server = HTTPServer((HOST, PORT), Handler)
    print(f"pistomp-audio-api listening on http://{HOST}:{PORT} (ALSA via {_backend})", flush=True)
    try:
        server.serve_forever()
    finally:
        # A pending debounced store must not die with the service.
        _flush_pending_store()


if __name__ == "__main__":
    main()
