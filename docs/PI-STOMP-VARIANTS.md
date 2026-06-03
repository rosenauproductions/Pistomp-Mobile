# Pi-Stomp variants and Pistomp-Mobile install

## Reference platform: headless acoustic (v1.0.0)

**Pistomp-Mobile 1.0.0** is field-verified on the **headless acoustic** Pi-Stomp image (overlayroot, locked SD). Use the workflow in [MILESTONE-HEADLESS-ACOUSTIC.md](./MILESTONE-HEADLESS-ACOUSTIC.md) and [DEPLOYMENT.md](../DEPLOYMENT.md).

Other Pi-Stomp builds (vanilla pi-gen, full PCB Pi 5, writable root) use the same app and install scripts; only the **deploy path** differs.

---

## WiFi hotspot ↔ router (same as System menu)

The Pi-Stomp LCD/System menu uses `modalapi/wifi/ops.py`:

- **Hotspot:** `enable_hotspot()` — NetworkManager AP profile (`pistomp-hotspot` or `Hotspot`), plus `wifi-hotspot.service` when present.
- **Router:** `disable_hotspot()` — bring down AP, activate saved client profile.

On **vanilla Pi-Stomp** (writable root), NetworkManager profiles under `/etc/NetworkManager/system-connections/` persist across reboot.

On **overlayroot / locked SD** (headless acoustic), live NM changes are lost on reboot unless written in **chroot**. Pistomp-Mobile therefore:

1. Writes **`/boot/firmware/pistomp-mobile/wifi-mode.json`** (FAT — survives reboot).
2. Installs **`pistomp-wifi-api.py`** and **`pistomp-wifi-mode-apply.service`** on the real SD via chroot (`/opt/pistomp-mobile/`).
3. When `/proc/1/root` is available during a session, can also mirror NM/systemd state onto the real root.

After changing WiFi mode in the app, verify:

```bash
cat /boot/firmware/pistomp-mobile/wifi-mode.json
grep '"running" in stdout' /opt/pistomp-mobile/pistomp-wifi-api.py
```

Use **`"running"`** (0.2.15+). If you see **`b"running"`**, the old API is still on `/opt` — re-run chroot install.

---

## Deploy paths

| Build | Install |
|-------|---------|
| **Headless acoustic (overlayroot)** | Mac `scp` → `stage-on-boot-firmware.sh` → chroot → `install-on-pistomp.sh` → reboot |
| Writable root (vanilla / some Pi 5) | `sudo bash install-on-pistomp.sh` in `~/Pistomp-Mobile` |

**Do not** rely on `sudo cp` to `/opt` alone on overlayroot — it does not survive reboot.

See [DEPLOYMENT.md](../DEPLOYMENT.md).
