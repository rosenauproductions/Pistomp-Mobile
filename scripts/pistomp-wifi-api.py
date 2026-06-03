#!/usr/bin/env python3
"""WiFi hotspot/router toggle API for Pistomp-Mobile (mirrors pi-stomp modalapi/wifi/ops.py)."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Optional
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 8767
IFACE = "wlan0"

HOTSPOT_CONN_NAME = "pistomp-hotspot"
HOTSPOT_SSID = "pistomp"
HOTSPOT_PSK = "pistompwifi"

ENABLE_SCRIPTS = (
    "/usr/lib/patchbox-wifi/enable_wifi_hotspot.sh",
    "/usr/local/bin/enable_wifi_hotspot.sh",
)
DISABLE_SCRIPTS = (
    "/usr/lib/patchbox-wifi/disable_wifi_hotspot.sh",
    "/usr/local/bin/disable_wifi_hotspot.sh",
)

# Survives overlayroot reboot (FAT boot). Fallback for vanilla writable ~/data.
BOOT_WIFI_DIR = "/boot/firmware/pistomp-mobile"
WIFI_MODE_PREF_NAME = "wifi-mode.json"
WIFI_MODE_PREF_PATHS = (
    os.path.join(BOOT_WIFI_DIR, WIFI_MODE_PREF_NAME),
    "/home/pistomp/data/pistomp-mobile-wifi-mode.json",
)
REAL_ROOT = "/proc/1/root"


def nmcli(args: list[str], timeout: int = 30) -> tuple[Optional[bytes], Optional[bytes]]:
    cmd = ["nmcli", *args]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
        return proc.stdout, proc.stderr if proc.returncode != 0 else None
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        return None, str(e).encode("utf-8")


def split_terse(line: str) -> list[str]:
    return line.split(":") if ":" in line else line.split()


def parse_kv_lines(stdout: bytes) -> dict[str, str]:
    text = stdout.decode("utf-8", "replace")
    out: dict[str, str] = {}
    for line in text.strip().split("\n"):
        if not line.strip():
            continue
        parts = split_terse(line)
        if len(parts) >= 2:
            out[parts[0]] = parts[1]
    return out


def wifi_profile_ssid_mode(uuid: str) -> tuple[str, str]:
    stdout, err = nmcli(
        ["-t", "-f", "802-11-wireless.ssid,802-11-wireless.mode", "connection", "show", uuid],
        timeout=10,
    )
    if err is not None or stdout is None:
        return "", ""
    kv = parse_kv_lines(stdout)
    return kv.get("802-11-wireless.ssid", ""), kv.get("802-11-wireless.mode", "")


def list_client_connections() -> list[dict]:
    stdout, err = nmcli(
        ["-t", "-f", "NAME,UUID,TYPE,TIMESTAMP", "connection", "show"],
        timeout=10,
    )
    if err is not None or stdout is None:
        return []
    connections: list[dict] = []
    for line in stdout.decode("utf-8", "replace").strip().split("\n"):
        if not line:
            continue
        parts = split_terse(line)
        if len(parts) < 4 or parts[2] != "802-11-wireless":
            continue
        name, uuid = parts[0], parts[1]
        try:
            timestamp = int(parts[3]) if parts[3] else 0
        except ValueError:
            timestamp = 0
        ssid, mode = wifi_profile_ssid_mode(uuid)
        if mode == "ap":
            continue
        connections.append({"name": name, "ssid": ssid or name, "timestamp": timestamp})
    return connections


def list_ap_profile_names() -> list[str]:
    stdout, err = nmcli(["-t", "-f", "NAME,UUID,TYPE", "connection", "show"], timeout=10)
    if err is not None or stdout is None:
        return []
    names: list[str] = []
    for line in stdout.decode("utf-8", "replace").strip().split("\n"):
        if not line:
            continue
        parts = split_terse(line)
        if len(parts) < 3 or parts[2] != "802-11-wireless":
            continue
        name, uuid = parts[0], parts[1]
        _, mode = wifi_profile_ssid_mode(uuid)
        if mode == "ap":
            names.append(name)
    return names


def find_hotspot_profile() -> Optional[str]:
    ap_names = list_ap_profile_names()
    if not ap_names:
        return None
    for preferred in (HOTSPOT_CONN_NAME, "Hotspot"):
        if preferred in ap_names:
            return preferred
    return ap_names[0]


def _real_root() -> Optional[str]:
    if os.path.isdir(os.path.join(REAL_ROOT, "etc")):
        return REAL_ROOT
    return None


def _wifi_pref_payload(mode: str, router_connection: Optional[str] = None) -> dict:
    payload: dict = {
        "mode": mode,
        "updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "pistomp-mobile",
    }
    if router_connection:
        payload["routerConnection"] = router_connection
    return payload


def _write_pref_file(path: str, payload: dict) -> None:
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f)
            f.write("\n")
    except OSError:
        pass


def load_wifi_mode_pref() -> dict:
    paths = list(WIFI_MODE_PREF_PATHS)
    root = _real_root()
    if root:
        paths.insert(0, os.path.join(root, "boot", "firmware", "pistomp-mobile", WIFI_MODE_PREF_NAME))
    for path in paths:
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and data.get("mode"):
                return data
        except (OSError, json.JSONDecodeError):
            continue
    return {}


def save_wifi_mode_pref(mode: str, router_connection: Optional[str] = None) -> None:
    payload = _wifi_pref_payload(mode, router_connection)
    for path in WIFI_MODE_PREF_PATHS:
        _write_pref_file(path, payload)
    root = _real_root()
    if root:
        _write_pref_file(
            os.path.join(root, "boot", "firmware", "pistomp-mobile", WIFI_MODE_PREF_NAME),
            payload,
        )


def _copy_nm_profiles_to_real_root() -> None:
    """Overlayroot: NM edits in RAM must be copied onto the real SD root."""
    root = _real_root()
    if not root:
        return
    src = "/etc/NetworkManager/system-connections"
    dst = os.path.join(root, "etc", "NetworkManager", "system-connections")
    if not os.path.isdir(src):
        return
    try:
        os.makedirs(dst, mode=0o700, exist_ok=True)
    except OSError:
        return
    for name in os.listdir(src):
        if not name.endswith(".nmconnection"):
            continue
        try:
            shutil.copy2(os.path.join(src, name), os.path.join(dst, name))
            os.chmod(os.path.join(dst, name), 0o600)
        except OSError:
            pass


def _persist_wifi_hotspot_unit_on_sd(mode: str) -> None:
    """Match pi-gen pistomp: wifi-hotspot.service starts AP on boot unless router mode."""
    root = _real_root()
    if not root:
        return
    action = "disable" if mode == "router" else "enable"
    try:
        subprocess.run(
            ["systemctl", "--root", root, action, "wifi-hotspot.service"],
            capture_output=True,
            timeout=60,
            check=False,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass


def persist_wifi_mode_to_sd(mode: str, router_connection: Optional[str] = None) -> None:
    """Write preference + pi-Stomp NM/systemd state to persistent storage (vanilla + overlay)."""
    save_wifi_mode_pref(mode, router_connection)
    if mode == "router":
        for ap in list_ap_profile_names():
            set_connection_autoconnect(ap, False)
        if router_connection:
            set_connection_autoconnect(router_connection, True, 80)
    else:
        for c in list_client_connections():
            set_connection_autoconnect(c["name"], False)
        for ap in list_ap_profile_names():
            set_connection_autoconnect(ap, True, 100)
    _copy_nm_profiles_to_real_root()
    _persist_wifi_hotspot_unit_on_sd(mode)


def connect_saved(name: str, wait: bool = True) -> Optional[bytes]:
    """Same as pi-stomp modalapi/wifi/ops.connect_saved."""
    args = ["--wait", "0", "connection", "up", name] if not wait else ["connection", "up", name]
    _, err = nmcli(args, timeout=45 if wait else 10)
    return err


def disable_hotspot_pi_stomp() -> Optional[bytes]:
    """pi-stomp modalapi/wifi/ops.disable_hotspot — down AP, reconnect client."""
    name = find_hotspot_profile()
    if name is not None:
        _, err = nmcli(["connection", "down", name], timeout=20)
        if err is not None:
            text = err.decode("utf-8", "replace").lower()
            if "not an active" not in text and "unknown connection" not in text:
                return err
    saved = list_client_connections()
    if not saved:
        return None
    most_recent = max(saved, key=lambda c: c["timestamp"] or 0)
    return connect_saved(most_recent["name"], wait=False)


def enable_hotspot_pi_stomp() -> Optional[bytes]:
    """pi-stomp modalapi/wifi/ops.enable_hotspot — NM only (no systemd touch)."""
    name = find_hotspot_profile()
    if name is None:
        err = create_default_hotspot_profile()
        if err is not None:
            return err
        name = HOTSPOT_CONN_NAME
    _, err = nmcli(["connection", "up", name], timeout=45)
    return err


def set_connection_autoconnect(name: str, enabled: bool, priority: Optional[int] = None) -> Optional[bytes]:
    flag = "yes" if enabled else "no"
    args = ["connection", "modify", name, "connection.autoconnect", flag]
    if priority is not None and enabled:
        args.extend(["connection.autoconnect-priority", str(priority)])
    _, err = nmcli(args, timeout=15)
    return err


def set_all_ap_autoconnect(enabled: bool) -> None:
    priority = 100 if enabled else None
    for name in list_ap_profile_names():
        set_connection_autoconnect(name, enabled, priority)


def pick_router_connection(explicit: Optional[str] = None) -> Optional[str]:
    if explicit:
        for c in list_client_connections():
            if c["name"] == explicit or c["ssid"] == explicit:
                return c["name"]
    saved = list_client_connections()
    if not saved:
        return None
    return max(saved, key=lambda c: c["timestamp"] or 0)["name"]


def systemctl_wifi_hotspot_service(enable: bool) -> Optional[bytes]:
    action = "enable" if enable else "disable"
    try:
        proc = subprocess.run(
            ["systemctl", action, "--now", "wifi-hotspot.service"],
            capture_output=True,
            timeout=60,
            check=False,
        )
        if proc.returncode == 0:
            return None
        err = (proc.stderr or proc.stdout or b"").decode("utf-8", "replace").lower()
        if "not found" in err or "could not find" in err or "does not exist" in err:
            return None
        return proc.stderr or proc.stdout or b"systemctl failed"
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        return str(e).encode("utf-8")


def wait_for_network_manager(timeout: int = 45) -> bool:
    for _ in range(timeout):
        stdout, err = nmcli(["-t", "-f", "RUNNING", "general"], timeout=5)
        if err is None and stdout:
            if "running" in stdout.decode("utf-8", "replace").lower():
                return True
        time.sleep(1)
    return False


def disconnect_client_profiles() -> None:
    for c in list_client_connections():
        nmcli(["connection", "down", c["name"]], timeout=20)


def is_hotspot_active() -> bool:
    return read_wifi_status().get("mode") == "hotspot"


def apply_saved_wifi_mode() -> tuple[bool, Optional[str]]:
    pref = load_wifi_mode_pref()
    mode = (pref.get("mode") or "").strip().lower()
    if mode not in ("hotspot", "router"):
        return True, None
    if not wait_for_network_manager():
        return False, "NetworkManager not ready"
    if mode == "router":
        return apply_router_mode(pref.get("routerConnection"), persist=False)
    return apply_hotspot_mode(persist=False)


def apply_router_mode(router_connection: Optional[str] = None, persist: bool = False) -> tuple[bool, Optional[str]]:
    router_name = pick_router_connection(
        str(router_connection) if router_connection else None,
    )
    for ap in list_ap_profile_names():
        nmcli(["connection", "down", ap], timeout=20)
    run_script(DISABLE_SCRIPTS)
    err = disable_hotspot_pi_stomp()
    if err is not None and not router_name:
        return False, err.decode("utf-8", "replace")
    systemctl_wifi_hotspot_service(False)
    if router_name:
        _, err = nmcli(["connection", "up", router_name], timeout=45)
        if err is not None:
            return False, err.decode("utf-8", "replace")
    if persist:
        persist_wifi_mode_to_sd("router", router_name)
    return True, None


def apply_hotspot_mode(persist: bool = False) -> tuple[bool, Optional[str]]:
    """pi-stomp ops.enable_hotspot + wifi-hotspot.service (no patchbox scripts on some images)."""
    disconnect_client_profiles()
    systemctl_wifi_hotspot_service(True)
    run_script(ENABLE_SCRIPTS)
    err = enable_hotspot_pi_stomp()
    if err is not None:
        try:
            subprocess.run(
                ["systemctl", "start", "wifi-hotspot.service"],
                capture_output=True,
                timeout=60,
                check=False,
            )
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass
        err = enable_hotspot_pi_stomp()
    if err is not None:
        return False, err.decode("utf-8", "replace")
    if not is_hotspot_active():
        conn = read_wifi_status().get("connectionName") or "unknown"
        return False, f"Hotspot did not activate (still on {conn})"
    if persist:
        persist_wifi_mode_to_sd("hotspot")
    return True, None


def read_hotspot_credentials() -> tuple[str, str]:
    name = find_hotspot_profile()
    if not name:
        return HOTSPOT_SSID, HOTSPOT_PSK
    ssid = HOTSPOT_SSID
    psk = HOTSPOT_PSK
    stdout, err = nmcli(
        ["-t", "-f", "802-11-wireless.ssid", "connection", "show", name],
        timeout=10,
    )
    if err is None and stdout:
        kv = parse_kv_lines(stdout)
        ssid = kv.get("802-11-wireless.ssid", ssid) or ssid
    stdout2, err2 = nmcli(
        ["-s", "-g", "802-11-wireless-security.psk", "connection", "show", name],
        timeout=10,
    )
    if err2 is None and stdout2:
        text = stdout2.decode("utf-8", "replace").strip().splitlines()[0].strip()
        if text and text != "--":
            psk = text
    return ssid, psk


def read_wifi_status() -> dict:
    hsid, hpsk = read_hotspot_credentials()
    status: dict = {
        "hotspotActive": False,
        "mode": "router",
        "hotspotSsid": hsid,
        "hotspotPassword": hpsk,
        "savedNetworks": list_client_connections(),
    }
    wireless = os.path.join("/sys", "class", "net", IFACE, "wireless")
    if not os.path.exists(wireless):
        status["error"] = "wifi not supported"
        return status

    stdout, err = nmcli(
        [
            "-t",
            "-f",
            "GENERAL.STATE,GENERAL.CONNECTION,IP4.ADDRESS",
            "device",
            "show",
            IFACE,
        ],
        timeout=10,
    )
    if err is None and stdout:
        kv = parse_kv_lines(stdout)
        connection = kv.get("GENERAL.CONNECTION", "")
        for key, value in kv.items():
            if key == "IP4.ADDRESS" or key.startswith("IP4.ADDRESS["):
                status["ipAddress"] = value.split("/")[0]
                break
        if connection and connection != "--":
            status["connectionName"] = connection
            ssid, mode = wifi_profile_ssid_mode_from_name(connection)
            if ssid:
                status["ssid"] = ssid
            if mode == "ap":
                status["hotspotActive"] = True
                status["mode"] = "hotspot"
            else:
                status["mode"] = "router"
    elif not status.get("ipAddress"):
        status["mode"] = "unknown"

    if not status.get("hotspotActive") and find_hotspot_profile():
        ap = find_hotspot_profile()
        if ap:
            stdout2, err2 = nmcli(
                ["-t", "-f", "GENERAL.STATE", "connection", "show", ap],
                timeout=5,
            )
            if err2 is None and stdout2:
                if parse_kv_lines(stdout2).get("GENERAL.STATE") == "activated":
                    status["hotspotActive"] = True
                    status["mode"] = "hotspot"
                    status["ssid"] = HOTSPOT_SSID

    return status


def wifi_profile_ssid_mode_from_name(name: str) -> tuple[str, str]:
    stdout, err = nmcli(
        ["-t", "-f", "802-11-wireless.ssid,802-11-wireless.mode", "connection", "show", name],
        timeout=10,
    )
    if err is not None or stdout is None:
        return "", ""
    kv = parse_kv_lines(stdout)
    return kv.get("802-11-wireless.ssid", ""), kv.get("802-11-wireless.mode", "")


def create_hotspot_profile(ssid: str, psk: str) -> Optional[bytes]:
    _, err = nmcli(
        [
            "connection",
            "add",
            "type",
            "wifi",
            "ifname",
            IFACE,
            "con-name",
            HOTSPOT_CONN_NAME,
            "autoconnect",
            "no",
            "ssid",
            ssid,
            "mode",
            "ap",
            "--",
            "wifi-sec.key-mgmt",
            "wpa-psk",
            "wifi-sec.psk",
            psk,
            "ipv4.method",
            "shared",
        ],
        timeout=20,
    )
    return err


def create_default_hotspot_profile() -> Optional[bytes]:
    return create_hotspot_profile(HOTSPOT_SSID, HOTSPOT_PSK)


def resolve_unique_name(desired: str) -> str:
    existing = {c["name"] for c in list_client_connections()}
    name = desired
    counter = 2
    while name in existing:
        name = f"{desired} ({counter})"
        counter += 1
    return name


def configure_hotspot(ssid: str, password: str) -> tuple[bool, Optional[str]]:
    ssid = ssid.strip()
    password = password.strip()
    if not ssid or len(ssid) > 32:
        return False, "Hotspot SSID must be 1–32 characters"
    if not password or len(password) < 8:
        return False, "Hotspot password must be at least 8 characters"
    was_active = False
    name = find_hotspot_profile()
    if name:
        stdout, _ = nmcli(["-t", "-f", "GENERAL.STATE", "connection", "show", name], timeout=5)
        if stdout and parse_kv_lines(stdout).get("GENERAL.STATE") == "activated":
            was_active = True
            nmcli(["connection", "down", name], timeout=20)
        _, err = nmcli(["connection", "modify", name, "802-11-wireless.ssid", ssid], timeout=20)
        if err is not None:
            return False, err.decode("utf-8", "replace")
        _, err = nmcli(
            ["connection", "modify", name, "wifi-sec.psk", password],
            timeout=20,
        )
        if err is not None:
            return False, err.decode("utf-8", "replace")
    else:
        err = create_hotspot_profile(ssid, password)
        if err is not None:
            return False, err.decode("utf-8", "replace")
        name = HOTSPOT_CONN_NAME
    set_connection_autoconnect(name, False)
    if was_active:
        _, err = nmcli(["connection", "up", name], timeout=45)
        if err is not None:
            return False, err.decode("utf-8", "replace")
    return True, None


def connect_router_wifi(ssid: str, password: str) -> tuple[bool, Optional[str]]:
    ssid = ssid.strip()
    password = password.strip()
    if not ssid:
        return False, "Router SSID is required"
    for ap in list_ap_profile_names():
        nmcli(["connection", "down", ap], timeout=20)
    saved = {c["ssid"]: c["name"] for c in list_client_connections()}
    if ssid in saved:
        con_name = saved[ssid]
        _, err = nmcli(["connection", "up", con_name], timeout=45)
        if err is None:
            if password:
                _, err = nmcli(
                    ["connection", "modify", con_name, "wifi-sec.psk", password],
                    timeout=20,
                )
                if err is None:
                    nmcli(["connection", "up", con_name], timeout=45)
            _persist_router_mode(con_name)
            return True, None
        return False, err.decode("utf-8", "replace")
    con_name = resolve_unique_name(ssid)
    add_args = [
        "connection",
        "add",
        "type",
        "wifi",
        "ifname",
        IFACE,
        "con-name",
        con_name,
        "ssid",
        ssid,
        "connection.autoconnect",
        "yes",
    ]
    if password:
        add_args += [
            "--",
            "wifi-sec.key-mgmt",
            "wpa-psk",
            "wifi-sec.psk",
            password,
        ]
    _, err = nmcli(add_args, timeout=25)
    if err is not None:
        return False, err.decode("utf-8", "replace")
    _, err = nmcli(["connection", "up", con_name], timeout=45)
    if err is not None:
        nmcli(["connection", "delete", con_name], timeout=15)
        return False, err.decode("utf-8", "replace")
    _persist_router_mode(con_name)
    return True, None


def _persist_router_mode(router_connection: str) -> None:
    systemctl_wifi_hotspot_service(False)
    persist_wifi_mode_to_sd("router", router_connection)


def run_script(paths: tuple[str, ...]) -> Optional[bytes]:
    for path in paths:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            try:
                proc = subprocess.run(
                    [path],
                    capture_output=True,
                    timeout=60,
                    check=False,
                )
                if proc.returncode == 0:
                    return None
                return proc.stderr or proc.stdout or b"script failed"
            except (subprocess.TimeoutExpired, OSError) as e:
                return str(e).encode("utf-8")
    return None


def enable_hotspot() -> tuple[bool, Optional[str]]:
    return apply_hotspot_mode(persist=True)


def disable_hotspot() -> tuple[bool, Optional[str]]:
    pref = load_wifi_mode_pref()
    router_name = pick_router_connection(pref.get("routerConnection"))
    if not router_name:
        return False, "No saved router Wi‑Fi on the Pi — use Configure WiFi to add your home network first"
    return apply_router_mode(router_name, persist=True)


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
        if path == "/status":
            self._json(200, read_wifi_status())
            return
        self._json(404, {"error": "not found"})

    def _read_json_body(self) -> Optional[dict]:
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return None

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        body = self._read_json_body()
        if body is None:
            self._json(400, {"error": "invalid json"})
            return

        if path == "/configure":
            target = (body.get("target") or "").strip().lower()
            ssid = str(body.get("ssid") or "")
            password = str(body.get("password") or "")
            if target == "hotspot":
                ok, err = configure_hotspot(ssid, password)
            elif target == "router":
                ok, err = connect_router_wifi(ssid, password)
            else:
                self._json(400, {"error": "target must be hotspot or router"})
                return
            if ok:
                self._json(200, {"ok": True, "status": read_wifi_status()})
            else:
                self._json(500, {"ok": False, "error": err or "configure failed"})
            return

        if path != "/mode":
            self._json(404, {"error": "not found"})
            return
        mode = (body.get("mode") or "").strip().lower()
        if mode == "hotspot":
            ok, err = enable_hotspot()
        elif mode == "router":
            ok, err = disable_hotspot()
        else:
            self._json(400, {"error": "mode must be hotspot or router"})
            return
        if ok:
            self._json(200, {"ok": True, "status": read_wifi_status()})
        else:
            self._json(500, {"ok": False, "error": err or "wifi mode change failed"})


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "--apply-saved-mode":
        ok, err = apply_saved_wifi_mode()
        if not ok:
            print(f"pistomp-wifi-mode apply failed: {err}", file=sys.stderr, flush=True)
            sys.exit(1)
        pref = load_wifi_mode_pref()
        print(f"pistomp-wifi-mode applied: {pref.get('mode', '(none)')}", flush=True)
        return
    server = HTTPServer((HOST, PORT), Handler)
    print(f"pistomp-wifi-api listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
