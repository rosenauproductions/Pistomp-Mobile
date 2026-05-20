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

if [[ ! -d "./dist" ]]; then
  echo "Missing ./dist — run 'npm run build' on your machine and copy the project folder here first."
  exit 1
fi

echo "Installing to ${INSTALL_DIR}..."
mkdir -p "${WEB_ROOT}"
rm -rf "${WEB_ROOT:?}"/*
cp -a dist/. "${WEB_ROOT}/"

if ! command -v nginx >/dev/null 2>&1; then
  echo "Installing nginx..."
  apt-get update -qq
  apt-get install -y nginx
fi

cat > "${NGINX_SITE}" <<EOF
server {
    listen ${PORT};
    listen [::]:${PORT};
    server_name _;

    root ${WEB_ROOT};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
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
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
EOF

ln -sf "${NGINX_SITE}" "${NGINX_ENABLED}"
nginx -t
systemctl reload nginx

echo ""
echo "Done. Open http://pistomp.local:${PORT} from your phone (or http://172.24.1.1:${PORT} if .local does not resolve)."
echo "Add to Home Screen for an app icon."
