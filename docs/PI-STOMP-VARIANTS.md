# Pi-Stomp variants and Pistomp-Mobile install

Pistomp-Mobile targets **stock Pi-Stomp images** (pi-gen-pistomp) and **custom headless builds** (overlayroot, locked SD).

## WiFi hotspot ↔ router (same as System menu)

The Pi-Stomp LCD/System menu uses `modalapi/wifi/ops.py`:

- **Hotspot:** `enable_hotspot()` — NetworkManager AP profile (`pistomp-hotspot` or `Hotspot`), same as patchbox scripts when present.
- **Router:** `disable_hotspot()` — bring down AP, activate saved client profile (`connection.autoconnect yes` on router profiles).

On **vanilla Pi-Stomp** (writable root), NetworkManager profiles under `/etc/NetworkManager/system-connections/` persist across reboot. `wifi-hotspot.service` (pi-gen) starts the AP on boot unless you stay in router mode.

On **overlayroot / locked SD** (headless acoustic build), NM and systemd changes in the **live overlay are erased on reboot**. Pistomp-Mobile therefore also:

1. Writes **`/boot/firmware/pistomp-mobile/wifi-mode.json`** (FAT partition — survives reboot).
2. When `/proc/1/root` is available, copies NM profiles and `systemctl --root=/proc/1/root disable|enable wifi-hotspot.service` onto the **real SD root**.

After changing WiFi mode in the app, verify:

```bash
cat /boot/firmware/pistomp-mobile/wifi-mode.json
```

## Deploy paths

| Build | Install |
|-------|---------|
| Overlayroot (locked SD) | Mac `scp` → stage `/boot/firmware/pistomp-deploy/` → chroot → `install-on-pistomp.sh` → reboot |
| Writable root (vanilla) | `sudo bash install-on-pistomp.sh` in `~/Pistomp-Mobile` |

See [DEPLOYMENT.md](../DEPLOYMENT.md).
