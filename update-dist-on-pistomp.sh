#!/usr/bin/env bash
# Copy a built dist/ into /opt/pistomp-mobile/dist — for read-only root (overlayroot).
#
# Run INSIDE overlayroot-chroot from ~/Pistomp-Mobile (not ~/pi-stomp):
#   sudo overlayroot-chroot
#   cd /home/pistomp/Pistomp-Mobile
#   bash update-dist-on-pistomp.sh
#   exit
# Then outside chroot:
#   sudo systemctl reload nginx
#
set -euo pipefail

SRC="${1:-./dist}"
DEST="/opt/pistomp-mobile/dist"

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "Run as root inside overlayroot-chroot."
  exit 1
fi

if [[ ! -d "${SRC}" ]] || [[ ! -f "${SRC}/index.html" ]]; then
  echo "Missing ${SRC}/index.html — run 'npm run build' on your Mac and scp the project first."
  exit 1
fi

mkdir -p "${DEST}"
rm -rf "${DEST:?}"/*
cp -a "${SRC}/." "${DEST}/"
echo "Updated ${DEST} ($(du -sh "${DEST}" | cut -f1))"
