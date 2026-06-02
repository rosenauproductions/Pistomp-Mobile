#!/usr/bin/env python3
"""WiFi hotspot/router toggle API for Pistomp-Mobile (mirrors pi-stomp modalapi/wifi/ops.py)."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Optional, Union
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


def find_hotspot_profile() -> Optional[str]:
    stdout, err = nmcli(["-t", "-f", "NAME,UUID,TYPE", "connection", "show"], timeout=10)
    if err is not None or stdout is None:
        return None
    for line in stdout.decode("utf-8", "replace").strip().split("\n"):
        if not line:
            continue
        parts = split_terse(line)
        if len(parts) < 3 or parts[2] != "802-11-wireless":
            continue
        name, uuid = parts[0], parts[1]
        _, mode = wifi_profile_ssid_mode(uuid)
        if mode == "ap":
            return name
    return None


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
        text = stdout2.decode("utf-8", "replace").strip()
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
    disable_hotspot_nmcli()
    saved = {c["ssid"]: c["name"] for c in list_client_connections()}
    if ssid in saved:
        _, err = nmcli(["connection", "up", saved[ssid]], timeout=45)
        if err is None:
            if password:
                _, err = nmcli(
                    ["connection", "modify", saved[ssid], "wifi-sec.psk", password],
                    timeout=20,
                )
                if err is None:
                    nmcli(["connection", "up", saved[ssid]], timeout=45)
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
    return True, None


def enable_hotspot_nmcli() -> Optional[bytes]:
    name = find_hotspot_profile()
    if name is None:
        err = create_default_hotspot_profile()
        if err is not None:
            return err
        name = HOTSPOT_CONN_NAME
    _, err = nmcli(["connection", "up", name], timeout=45)
    return err


def disable_hotspot_nmcli() -> Optional[bytes]:
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
    _, err = nmcli(["--wait", "0", "connection", "up", most_recent["name"]], timeout=10)
    return err


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


def systemctl_hotspot(enable: bool) -> Optional[bytes]:
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
        return proc.stderr or proc.stdout or b"systemctl failed"
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        return str(e).encode("utf-8")


def enable_hotspot() -> tuple[bool, Optional[str]]:
    err = enable_hotspot_nmcli()
    if err is None:
        return True, None
    err_text = err.decode("utf-8", "replace")
    script_err = run_script(ENABLE_SCRIPTS)
    if script_err is None:
        return True, None
    sys_err = systemctl_hotspot(True)
    if sys_err is None:
        return True, None
    return False, err_text or script_err.decode("utf-8", "replace")


def disable_hotspot() -> tuple[bool, Optional[str]]:
    err = disable_hotspot_nmcli()
    if err is None:
        return True, None
    err_text = err.decode("utf-8", "replace") if err else ""
    script_err = run_script(DISABLE_SCRIPTS)
    if script_err is None:
        return True, None
    sys_err = systemctl_hotspot(False)
    if sys_err is None:
        return True, None
    return False, err_text or script_err.decode("utf-8", "replace")


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
    server = HTTPServer((HOST, PORT), Handler)
    print(f"pistomp-wifi-api listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
