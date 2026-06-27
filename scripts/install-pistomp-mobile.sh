#!/usr/bin/env bash
# Install Pistomp-Mobile from a git clone on the Pi (prebuilt dist/ in repo).
#
# First install:
#   git clone https://github.com/rosenauproductions/Pistomp-Mobile.git ~/Pistomp-Mobile
#   cd ~/Pistomp-Mobile
#   bash scripts/install-pistomp-mobile.sh
#
# Writable root (vanilla): installs directly.
# Overlayroot (headless): stages on /boot/firmware, chroot install, optional reboot.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${REPO_ROOT}"

REBOOT=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --reboot) REBOOT=1; shift ;;
    -h|--help)
      cat <<'EOF'
Usage: bash scripts/install-pistomp-mobile.sh [--reboot]

Install from the current repo tree (expects prebuilt dist/ in git).
For updates with git pull, use scripts/update-pistomp-mobile.sh instead.

  --reboot   Reboot after overlayroot install (recommended on headless)
EOF
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ ! -d "./dist" ]] || [[ ! -f "./dist/index.html" ]]; then
  cat <<'EOF'
Missing ./dist — this repo checkout has no prebuilt web app.

  git pull                         # get latest with dist/
  git checkout release/1.1.x       # stable release branch (prebuilt)
  git checkout v1.1.0              # tagged release (when dist is on tag)

Developers: npm install && npm run build on a computer, then commit dist/
or copy dist/ to the Pi (see DEPLOYMENT.md).
EOF
  exit 1
fi

if [[ ! -f "./install-on-pistomp.sh" ]]; then
  echo "Missing install-on-pistomp.sh in ${REPO_ROOT}"
  exit 1
fi

overlayroot_chroot_bin() {
  local p
  for p in /usr/sbin/overlayroot-chroot /sbin/overlayroot-chroot; do
    if [[ -x "${p}" ]]; then
      echo "${p}"
      return 0
    fi
  done
  command -v overlayroot-chroot 2>/dev/null || true
}

uses_overlayroot() {
  local chroot_bin
  chroot_bin="$(overlayroot_chroot_bin)"
  if [[ -z "${chroot_bin}" ]]; then
    return 1
  fi
  if ! findmnt -n -o FSTYPE / 2>/dev/null | grep -q '^overlay$'; then
    return 1
  fi
  if [[ -f /etc/overlayroot.conf ]]; then
    local setting
    setting="$(grep -E '^overlayroot=' /etc/overlayroot.conf 2>/dev/null | grep -v '^#' | tail -1 || true)"
    if [[ "${setting}" == *disabled* ]] || [[ -z "${setting}" ]]; then
      return 1
    fi
  fi
  return 0
}

install_writable() {
  echo "Writable root — installing to /opt/pistomp-mobile..."
  sudo bash ./install-on-pistomp.sh
  echo ""
  echo "Done. Open http://pistomp.local:8080 from your phone."
  echo "If :8080 does not load, see DEPLOYMENT.md → Fresh install: nginx installed but :8080 does not respond"
}

install_overlayroot() {
  local chroot_bin
  chroot_bin="$(overlayroot_chroot_bin)"
  echo "Overlayroot detected — staging on /boot/firmware, then chroot install..."
  bash "${REPO_ROOT}/scripts/stage-on-boot-firmware.sh" "${REPO_ROOT}"

  echo "Running install inside overlayroot-chroot..."
  if ! sudo "${chroot_bin}" /bin/bash -c '
set -euo pipefail
mkdir -p /home/pistomp/Pistomp-Mobile
cp -a /proc/1/root/boot/firmware/pistomp-deploy/dist \
      /proc/1/root/boot/firmware/pistomp-deploy/install-on-pistomp.sh \
      /proc/1/root/boot/firmware/pistomp-deploy/scripts \
      /home/pistomp/Pistomp-Mobile/
cd /home/pistomp/Pistomp-Mobile
bash install-on-pistomp.sh
echo CHROOT_INSTALL_OK
'; then
    echo "Chroot install failed."
    exit 1
  fi

  echo ""
  echo "Install written to real root on SD. Reboot required for nginx/systemd on headless images."
  if [[ "${REBOOT}" -eq 1 ]]; then
    echo "Rebooting..."
    sudo reboot
  else
    echo "Run: sudo reboot"
    echo "Then verify: curl -s http://127.0.0.1:8080/pistomp/wifi/status"
  fi
}

if uses_overlayroot; then
  install_overlayroot
else
  install_writable
fi
