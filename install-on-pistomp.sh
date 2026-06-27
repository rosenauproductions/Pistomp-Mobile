#!/usr/bin/env bash
# Install Pistomp-Mobile on a Pi-Stomp device (run on the Pi as root).
#
# Read-only SD (overlayroot): run inside writable chroot — see DEPLOYMENT.md
#   sudo overlayroot-chroot
#   cd /home/pistomp/Pistomp-Mobile && bash install-on-pistomp.sh
#   (~/pi-stomp is the firmware repo — separate from ~/Pistomp-Mobile)
#   exit
#   sudo systemctl reload nginx
#
set -euo pipefail

APP_NAME="pistomp-mobile"
INSTALL_DIR="/opt/${APP_NAME}"
WEB_ROOT="${INSTALL_DIR}/dist"
NGINX_SITE="/etc/nginx/sites-available/${APP_NAME}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${APP_NAME}"
PORT=8080

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

IN_CHROOT=0
_sysctl_out=$(systemctl is-system-running 2>&1 || true)
if [[ "${_sysctl_out}" == *"chroot"* ]] || [[ "${_sysctl_out}" == *"Chroot"* ]]; then
  IN_CHROOT=1
fi

if [[ ! -d "./dist" ]]; then
  cat <<'EOF'
Missing ./dist — prebuilt app not found.

  git clone + bash scripts/install-pistomp-mobile.sh   (dist/ is in the repo)
  git pull && bash scripts/update-pistomp-mobile.sh  (on the Pi)

Developers: npm run build on your computer, or build on the Pi with Node 18+.
EOF
  exit 1
fi

echo "Installing to ${INSTALL_DIR}..."
rm -rf "${WEB_ROOT}"
mkdir -p "${WEB_ROOT}"
cp -a dist/. "${WEB_ROOT}/"
# Drop orphaned hashed assets from older installs (PWA cache may still request them).
find "${WEB_ROOT}/assets" -maxdepth 1 -type f \( -name '*.js' -o -name '*.css' \) 2>/dev/null | while read -r f; do
  base=$(basename "$f")
  if ! grep -qF "$base" "${WEB_ROOT}/index.html" 2>/dev/null; then
    rm -f "$f"
  fi
done

AUDIO_API_DEST="${INSTALL_DIR}/pistomp-audio-api.py"
if [[ -f scripts/pistomp-audio-api.py ]]; then
  install -m 755 scripts/pistomp-audio-api.py "${AUDIO_API_DEST}"
else
  echo "scripts/pistomp-audio-api.py not found — installing bundled copy..."
  cat > "${AUDIO_API_DEST}" <<'PYAUDIO'
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
PYAUDIO
  chmod 755 "${AUDIO_API_DEST}"
fi

AUDIO_UNIT="/etc/systemd/system/pistomp-audio-api.service"
cat > "${AUDIO_UNIT}" <<EOF
[Unit]
Description=Pistomp Mobile ALSA API
After=network.target sound.target

[Service]
Type=simple
User=pistomp
Group=pistomp
Environment=PI_STOMP_HOME=/home/pistomp/pi-stomp
ExecStart=/usr/bin/python3 ${INSTALL_DIR}/pistomp-audio-api.py
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF
if [[ "${IN_CHROOT}" -eq 1 ]]; then
  echo "Note: overlayroot-chroot — systemd start/reload skipped (runs after reboot)."
else
  systemctl daemon-reload
  systemctl enable pistomp-audio-api.service
  systemctl restart pistomp-audio-api.service || systemctl start pistomp-audio-api.service
fi

WIFI_API_DEST="${INSTALL_DIR}/pistomp-wifi-api.py"
if [[ -f scripts/pistomp-wifi-api.py ]]; then
  install -m 755 scripts/pistomp-wifi-api.py "${WIFI_API_DEST}"
else
  echo "scripts/pistomp-wifi-api.py not found — copy the full Pistomp-Mobile repo and re-run install."
  exit 1
fi

WIFI_UNIT="/etc/systemd/system/pistomp-wifi-api.service"
cat > "${WIFI_UNIT}" <<EOF
[Unit]
Description=Pistomp Mobile WiFi API
After=network-online.target NetworkManager.service
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
ExecStart=/usr/bin/python3 ${WIFI_API_DEST}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
WIFI_MODE_UNIT="/etc/systemd/system/pistomp-wifi-mode-apply.service"
cat > "${WIFI_MODE_UNIT}" <<EOF
[Unit]
Description=Apply Pistomp-Mobile saved WiFi mode on boot
After=network-online.target NetworkManager.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 ${WIFI_API_DEST} --apply-saved-mode
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

if [[ "${IN_CHROOT}" -eq 1 ]]; then
  echo "Note: pistomp-wifi-api and pistomp-wifi-mode-apply will start after reboot."
else
  systemctl daemon-reload
  systemctl enable pistomp-wifi-api.service
  systemctl enable pistomp-wifi-mode-apply.service
  systemctl restart pistomp-wifi-api.service || systemctl start pistomp-wifi-api.service
fi

mkdir -p /home/pistomp/data
chmod 775 /home/pistomp/data 2>/dev/null || true
mkdir -p /boot/firmware/pistomp-mobile
chmod 755 /boot/firmware/pistomp-mobile 2>/dev/null || true
if [[ -f /home/pistomp/data/last.json ]]; then
  chmod o+r /home/pistomp/data/last.json 2>/dev/null || true
fi
chmod o+x /home/pistomp /home/pistomp/data 2>/dev/null || true

if ! command -v nginx >/dev/null 2>&1; then
  echo "Installing nginx..."
  apt-get update -qq
  apt-get install -y nginx
fi

# Same server block for Debian sites-available and vanilla Pi-Stomp (monolithic nginx.conf).
NGINX_SNIPPET="/etc/nginx/pistomp-mobile-8080.conf"
write_pistomp_nginx_server() {
  local dest="$1"
  cat > "${dest}" <<EOF
server {
    listen ${PORT};
    listen [::]:${PORT};
    server_name _;

    root ${WEB_ROOT};
    index index.html;

    location = /index.html {
        add_header Cache-Control "no-store, must-revalidate";
    }

    location = /manifest.webmanifest {
        add_header Cache-Control "no-store, must-revalidate";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-store, must-revalidate";
    }

    location = /pistomp-last.json {
        root /home/pistomp/data;
        try_files /last.json =404;
        default_type application/json;
        add_header Cache-Control "no-store";
    }

    location /pistomp/audio/ {
        proxy_pass http://127.0.0.1:8766/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }

    location /pistomp/wifi/ {
        proxy_pass http://127.0.0.1:8767/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location ^~ /reset {
        proxy_pass http://127.0.0.1:80;
        proxy_http_version 1.1;
        proxy_set_header Host 127.0.0.1;
    }

    location /pedalboard/ {
        proxy_pass http://127.0.0.1:80;
        proxy_http_version 1.1;
        proxy_set_header Host 127.0.0.1;
    }

    location /effect/ {
        proxy_pass http://127.0.0.1:80;
        proxy_http_version 1.1;
        proxy_set_header Host 127.0.0.1;
    }

    location /snapshot/ {
        proxy_pass http://127.0.0.1:80;
        proxy_http_version 1.1;
        proxy_set_header Host 127.0.0.1;
    }

    location /websocket {
        proxy_pass http://127.0.0.1:80;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host 127.0.0.1;
        proxy_set_header Origin "http://127.0.0.1";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
EOF
}

if [[ -d /etc/nginx/sites-available ]]; then
  write_pistomp_nginx_server "${NGINX_SITE}"
  mkdir -p /etc/nginx/sites-enabled
  ln -sf "${NGINX_SITE}" "${NGINX_ENABLED}"
  # Fresh apt nginx ships a default site on :80 — MOD-UI already owns :80 on Pi-Stomp.
  rm -f /etc/nginx/sites-enabled/default
  echo "nginx: installed site ${NGINX_SITE} (Debian layout)"
elif [[ -f "${NGINX_SNIPPET}" ]] \
  || grep -q 'pistomp-mobile-8080.conf' /etc/nginx/nginx.conf 2>/dev/null \
  || grep -q "listen ${PORT}" /etc/nginx/nginx.conf 2>/dev/null; then
  write_pistomp_nginx_server "${NGINX_SNIPPET}"
  if grep -q "listen ${PORT}" /etc/nginx/nginx.conf 2>/dev/null \
    && ! grep -q 'pistomp-mobile-8080.conf' /etc/nginx/nginx.conf 2>/dev/null; then
    cp -a /etc/nginx/nginx.conf "/etc/nginx/nginx.conf.bak.$(date +%Y%m%d%H%M%S)"
    python3 <<'PY'
import re
from pathlib import Path

conf = Path("/etc/nginx/nginx.conf")
text = conf.read_text()
pat = re.compile(
    r"    server \{.*?listen\s+8080.*?\n    \}\n",
    re.DOTALL,
)
if not pat.search(text):
    raise SystemExit("Could not find embedded listen 8080 server block in nginx.conf")
text = pat.sub("    include /etc/nginx/pistomp-mobile-8080.conf;\n", text, count=1)
conf.write_text(text)
PY
  fi
  echo "nginx: updated ${NGINX_SNIPPET} (vanilla Pi-Stomp layout)"
elif [[ -d /etc/nginx/conf.d ]]; then
  write_pistomp_nginx_server "/etc/nginx/conf.d/pistomp-mobile.conf"
  grep -q 'conf.d/\*\.conf' /etc/nginx/nginx.conf 2>/dev/null \
    || sed -i '/^http {/a\    include /etc/nginx/conf.d/*.conf;' /etc/nginx/nginx.conf
  echo "nginx: installed /etc/nginx/conf.d/pistomp-mobile.conf"
else
  echo "ERROR: unsupported nginx layout (no sites-available, conf.d, or listen ${PORT} in nginx.conf)"
  exit 1
fi

nginx -t
if [[ "${IN_CHROOT}" -eq 0 ]]; then
  systemctl enable nginx 2>/dev/null || true
  systemctl start nginx 2>/dev/null || systemctl restart nginx
  systemctl reload nginx 2>/dev/null || true
  if curl -sf "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
    echo "Verify OK: http://127.0.0.1:${PORT}/"
  else
    echo "WARN: nginx -t passed but :${PORT} is not responding."
    echo "  If this is a fresh apt nginx install, MOD-UI may own :80 — default site should be disabled (re-run this script)."
    echo "  Manual fix: sudo rm -f /etc/nginx/sites-enabled/default && sudo systemctl start nginx"
  fi
fi

echo ""
echo "Done. Open http://pistomp.local:${PORT} from your phone (or http://172.24.1.1:${PORT} if .local does not resolve)."
echo "Add to Home Screen for an app icon."
echo ""
echo "Includes: /pistomp-last.json, /reset proxy, /pistomp/audio/, /pistomp/wifi/ (hotspot toggle), pi_stomp_set for stomps."
echo "UI-only dist copy (scp dist only) does NOT update nginx or the audio API — run this script after UI changes."
if [[ "${IN_CHROOT}" -eq 1 ]]; then
  echo ""
  echo "=== overlayroot-chroot: next steps ==="
  echo "  exit          # leave chroot"
  echo "  sudo reboot   # start pistomp-audio-api + apply nginx on the live system"
  echo "After boot (optional):"
  echo "  systemctl status pistomp-audio-api"
  echo "  curl -s http://127.0.0.1:8080/pistomp/audio/controls | head"
  echo "  curl -s http://127.0.0.1:8080/pistomp/wifi/status"
fi
