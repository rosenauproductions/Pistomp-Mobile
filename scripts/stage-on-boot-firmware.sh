#!/usr/bin/env bash
# Stage Pistomp-Mobile onto the FAT boot partition so overlayroot-chroot can install it.
# Run on the Pi (normal SSH, NOT inside chroot) after Mac scp to ~/Pistomp-Mobile.
#
#   bash ~/Pistomp-Mobile/scripts/stage-on-boot-firmware.sh
#   bash ~/Pistomp-Mobile/scripts/stage-on-boot-firmware.sh /home/pistomp/Pistomp-Mobile
#
set -euo pipefail

SRC="${1:-${HOME}/Pistomp-Mobile}"
DEST="/boot/firmware/pistomp-deploy"

if [[ ! -d "${SRC}/dist" ]]; then
  echo "Missing ${SRC}/dist — git clone this repo (prebuilt dist/) or run npm run build."
  exit 1
fi
if [[ ! -f "${SRC}/install-on-pistomp.sh" ]]; then
  echo "Missing ${SRC}/install-on-pistomp.sh"
  exit 1
fi
if [[ ! -d "${SRC}/scripts" ]]; then
  echo "Missing ${SRC}/scripts (pistomp-audio-api.py, pistomp-wifi-api.py)"
  exit 1
fi
if [[ ! -d "${SRC}/packaging" ]]; then
  echo "Missing ${SRC}/packaging (systemd units + nginx conf)"
  exit 1
fi

echo "Staging ${SRC} → ${DEST} (FAT /boot/firmware)..."
sudo mkdir -p "${DEST}"
# FAT cannot preserve ownership; use cp without -a to avoid ownership errors.
sudo rm -rf "${DEST}/dist" "${DEST}/scripts" "${DEST}/packaging" "${DEST}/debian" "${DEST}/dist-deb"
sudo cp -r "${SRC}/dist" "${DEST}/"
sudo cp "${SRC}/install-on-pistomp.sh" "${DEST}/"
sudo cp -r "${SRC}/scripts" "${DEST}/"
sudo cp -r "${SRC}/packaging" "${DEST}/"
if [[ -d "${SRC}/debian" ]]; then
  sudo cp -r "${SRC}/debian" "${DEST}/"
fi
if [[ -d "${SRC}/dist-deb" ]]; then
  sudo cp -r "${SRC}/dist-deb" "${DEST}/"
fi

echo ""
echo "Verify:"
ls -la "${DEST}/scripts/"
ls -la "${DEST}/packaging/"
ls "${DEST}/dist/index.html"
df -h "${DEST}" | tail -1
echo ""
echo "Next: sudo overlayroot-chroot"
echo "  mkdir -p /home/pistomp/Pistomp-Mobile"
echo "  cp -a /proc/1/root/boot/firmware/pistomp-deploy/. /home/pistomp/Pistomp-Mobile/"
echo "  cd /home/pistomp/Pistomp-Mobile && bash install-on-pistomp.sh"
echo "  exit && sudo reboot"
