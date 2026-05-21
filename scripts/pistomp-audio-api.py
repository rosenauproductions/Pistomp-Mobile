#!/usr/bin/env python3
"""Small ALSA control API for Pistomp-Mobile (Pi hardware input/output gain)."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

HOST = "127.0.0.1"
PORT = 8766
CARD = 0

# IQaudIO Codec names (pi-stomp default); other cards still list via amixer.
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


def _run(cmd: str) -> str:
    return subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.STDOUT)


def list_controls() -> list[dict]:
    try:
        out = _run(f"amixer -c {CARD} scontrols")
    except subprocess.CalledProcessError:
        return [{"name": n, "label": lbl} for n, lbl in DEFAULT_CONTROLS]
    found: list[dict] = []
    for line in out.splitlines():
        m = re.search(r"Simple mixer control '([^']+)'", line)
        if m:
            name = m.group(1)
            found.append({"name": name, "label": name})
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
    try:
        s = _run(f"amixer -c {CARD} -- sget '{name}'")
    except subprocess.CalledProcessError:
        return None
    cur = re.search(r"\[(-?\d+\.\d+)dB\]", s)
    if not cur:
        return None
    value_db = round(float(cur.group(1)), 2)
    mins = [float(x) for x in re.findall(r"(-?\d+\.\d+)dB", s)]
    if len(mins) < 2:
        return {"valueDb": value_db, "minDb": -20.0, "maxDb": 12.0}
    return {"valueDb": value_db, "minDb": min(mins), "maxDb": max(mins)}


def set_volume_db(name: str, value_db: float) -> bool:
    cmd = f"amixer -c {CARD} -q -- sset '{name}' '{value_db}db'"
    try:
        subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT)
        return True
    except subprocess.CalledProcessError:
        return False


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
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path == "/controls":
            self._json(200, {"card": CARD, "controls": list_controls()})
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
        ok = set_volume_db(name, round(target_db, 2))
        self._json(200 if ok else 500, {"ok": ok})


def main() -> None:
    server = HTTPServer((HOST, PORT), Handler)
    print(f"pistomp-audio-api listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
