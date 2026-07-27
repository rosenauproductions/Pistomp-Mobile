#!/usr/bin/env bash
# Install Pistomp-Mobile on a Pi-Stomp device (run on the Pi as root).
#
# Prefers a .deb when available (dpkg -i). Falls back to copying files into
# /opt/pistomp-mobile (git/script path for new users).
#
# Read-only SD (overlayroot): run inside writable chroot — see DEPLOYMENT.md
#
set -euo pipefail

APP_NAME="pistomp-mobile"
INSTALL_DIR="/opt/${APP_NAME}"
WEB_ROOT="${INSTALL_DIR}/dist"
NGINX_SITE="/etc/nginx/sites-available/${APP_NAME}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${APP_NAME}"
NGINX_SNIPPET="/etc/nginx/pistomp-mobile-8080.conf"
PORT=8080
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGING="${SCRIPT_DIR}/packaging"

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

IN_CHROOT=0
_sysctl_out=$(systemctl is-system-running 2>&1 || true)
if [[ "${_sysctl_out}" == *"chroot"* ]] || [[ "${_sysctl_out}" == *"Chroot"* ]]; then
  IN_CHROOT=1
fi

if [[ ! -d "./dist" ]] || [[ ! -f "./dist/index.html" ]]; then
  cat <<'EOF'
Missing ./dist — prebuilt app not found.

  git clone + bash scripts/install-pistomp-mobile.sh   (dist/ is in the repo)
  git pull && bash scripts/update-pistomp-mobile.sh  (on the Pi)

Developers: npm run build on your computer, or build on the Pi with Node 18+.
EOF
  exit 1
fi

find_deb() {
  local f
  shopt -s nullglob
  for f in \
    "${SCRIPT_DIR}/dist-deb/${APP_NAME}_"*.deb \
    "${SCRIPT_DIR}/${APP_NAME}_"*.deb \
    ../"${APP_NAME}_"*.deb; do
    if [[ -f "${f}" ]]; then
      echo "${f}"
      return 0
    fi
  done
  shopt -u nullglob
  return 1
}

package_is_installed() {
  dpkg -s "${APP_NAME}" >/dev/null 2>&1
}

try_deb_install() {
  local deb=""
  deb="$(find_deb || true)"

  # Stale dist-deb/*.deb was the usual “git updated but :8080 did not” bug:
  # rebuild whenever repo dist/ is newer than the packaged .deb.
  if [[ -n "${deb}" ]] && [[ -f "${SCRIPT_DIR}/scripts/build-deb.sh" ]] \
    && command -v dpkg-deb >/dev/null 2>&1 \
    && [[ "${SCRIPT_DIR}/dist/index.html" -nt "${deb}" ]]; then
    echo "dist/ is newer than $(basename "${deb}") — rebuilding .deb..."
    bash "${SCRIPT_DIR}/scripts/build-deb.sh"
    deb="$(find_deb || true)"
  fi

  if [[ -z "${deb}" ]] && [[ -f "${SCRIPT_DIR}/scripts/build-deb.sh" ]] \
    && command -v dpkg-deb >/dev/null 2>&1; then
    echo "No .deb found — building one from this tree..."
    bash "${SCRIPT_DIR}/scripts/build-deb.sh"
    deb="$(find_deb || true)"
  fi

  if [[ -z "${deb}" ]]; then
    return 1
  fi

  echo "Installing ${deb} via dpkg..."
  if ! command -v nginx >/dev/null 2>&1; then
    echo "Installing nginx (package dependency)..."
    apt-get update -qq
    apt-get install -y nginx
  fi
  # Ensure Depends are present even if control Depends are soft during local dpkg -i
  apt-get install -y -f >/dev/null 2>&1 || true
  dpkg -i "${deb}" || apt-get install -y -f
  echo ""
  echo "Installed via dpkg. Open http://pistomp.local:${PORT} from your phone."
  return 0
}

install_nginx_site() {
  local conf_src="${PACKAGING}/nginx/pistomp-mobile.conf"
  if [[ ! -f "${conf_src}" ]]; then
    echo "ERROR: missing ${conf_src}" >&2
    exit 1
  fi

  if [[ -d /etc/nginx/sites-available ]]; then
    install -m 644 "${conf_src}" "${NGINX_SITE}"
    mkdir -p /etc/nginx/sites-enabled
    ln -sf "${NGINX_SITE}" "${NGINX_ENABLED}"
    rm -f /etc/nginx/sites-enabled/default
    install -m 644 "${conf_src}" "${NGINX_SNIPPET}"
    echo "nginx: installed site ${NGINX_SITE} (Debian layout)"
  elif [[ -f "${NGINX_SNIPPET}" ]] \
    || grep -q 'pistomp-mobile-8080.conf' /etc/nginx/nginx.conf 2>/dev/null \
    || grep -q "listen ${PORT}" /etc/nginx/nginx.conf 2>/dev/null; then
    install -m 644 "${conf_src}" "${NGINX_SNIPPET}"
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
    install -m 644 "${conf_src}" "/etc/nginx/conf.d/pistomp-mobile.conf"
    grep -q 'conf.d/\*\.conf' /etc/nginx/nginx.conf 2>/dev/null \
      || sed -i '/^http {/a\    include /etc/nginx/conf.d/*.conf;' /etc/nginx/nginx.conf
    echo "nginx: installed /etc/nginx/conf.d/pistomp-mobile.conf"
  else
    echo "ERROR: unsupported nginx layout (no sites-available, conf.d, or listen ${PORT} in nginx.conf)"
    exit 1
  fi
}

file_copy_install() {
  echo "File-copy install to ${INSTALL_DIR} (script path)..."

  if package_is_installed; then
    cat <<EOF
ERROR: ${APP_NAME} is already installed via dpkg.

Do not overwrite dpkg-owned files with cp. Instead:

  bash scripts/build-deb.sh
  sudo dpkg -i dist-deb/${APP_NAME}_*.deb

Or if published to the pistomp apt repo:

  sudo apt-get update
  sudo apt-get install --only-upgrade ${APP_NAME}

EOF
    exit 1
  fi

  if [[ ! -f scripts/pistomp-audio-api.py ]] || [[ ! -f scripts/pistomp-wifi-api.py ]]; then
    echo "ERROR: scripts/pistomp-audio-api.py and pistomp-wifi-api.py are required" >&2
    exit 1
  fi
  if [[ ! -d "${PACKAGING}/systemd" ]] || [[ ! -f "${PACKAGING}/nginx/pistomp-mobile.conf" ]]; then
    echo "ERROR: packaging/systemd and packaging/nginx are required" >&2
    exit 1
  fi

  rm -rf "${WEB_ROOT}"
  mkdir -p "${WEB_ROOT}"
  cp -a dist/. "${WEB_ROOT}/"
  find "${WEB_ROOT}/assets" -maxdepth 1 -type f \( -name '*.js' -o -name '*.css' \) 2>/dev/null | while read -r f; do
    base=$(basename "$f")
    if ! grep -qF "$base" "${WEB_ROOT}/index.html" 2>/dev/null; then
      rm -f "$f"
    fi
  done

  install -m 755 scripts/pistomp-audio-api.py "${INSTALL_DIR}/pistomp-audio-api.py"
  install -m 755 scripts/pistomp-wifi-api.py "${INSTALL_DIR}/pistomp-wifi-api.py"
  install -m 644 "${PACKAGING}/systemd/pistomp-audio-api.service" \
    /etc/systemd/system/pistomp-audio-api.service
  install -m 644 "${PACKAGING}/systemd/pistomp-wifi-api.service" \
    /etc/systemd/system/pistomp-wifi-api.service
  install -m 644 "${PACKAGING}/systemd/pistomp-wifi-mode-apply.service" \
    /etc/systemd/system/pistomp-wifi-mode-apply.service

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

  install_nginx_site

  if [[ "${IN_CHROOT}" -eq 1 ]]; then
    echo "Note: overlayroot-chroot — systemd start/reload skipped (runs after reboot)."
    systemctl enable pistomp-audio-api.service 2>/dev/null || true
    systemctl enable pistomp-wifi-api.service 2>/dev/null || true
    systemctl enable pistomp-wifi-mode-apply.service 2>/dev/null || true
  else
    systemctl daemon-reload
    systemctl enable pistomp-audio-api.service
    systemctl enable pistomp-wifi-api.service
    systemctl enable pistomp-wifi-mode-apply.service
    systemctl restart pistomp-audio-api.service || systemctl start pistomp-audio-api.service
    systemctl restart pistomp-wifi-api.service || systemctl start pistomp-wifi-api.service
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
      echo "  Manual fix: sudo rm -f /etc/nginx/sites-enabled/default && sudo systemctl start nginx"
    fi
  fi

  echo ""
  echo "Done. Open http://pistomp.local:${PORT} from your phone (or http://172.24.1.1:${PORT} if .local does not resolve)."
  echo "Add to Home Screen for an app icon."
  if [[ "${IN_CHROOT}" -eq 1 ]]; then
    echo ""
    echo "=== overlayroot-chroot: next steps ==="
    echo "  exit          # leave chroot"
    echo "  sudo reboot   # start services + apply nginx on the live system"
  fi
}

# Prefer .deb when tooling allows; otherwise file-copy for new users.
FORCE_FILE_COPY="${PISTOMP_MOBILE_FORCE_FILE_COPY:-0}"
if [[ "${FORCE_FILE_COPY}" != "1" ]] && try_deb_install; then
  if [[ "${IN_CHROOT}" -eq 1 ]]; then
    echo "Note: reboot after leaving chroot so systemd picks up units."
  fi
  exit 0
fi

file_copy_install
