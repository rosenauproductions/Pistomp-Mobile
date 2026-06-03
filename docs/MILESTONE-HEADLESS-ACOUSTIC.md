# Milestone: v1.0.0 — Headless acoustic Pi-Stomp

**Status:** Field-verified on the **headless acoustic** Pi-Stomp build (overlayroot, locked SD, IQaudIO, NetworkManager). Treat this release as the reference platform for deploy and QA.

Vanilla Pi-Stomp images (writable root, full PCB, pi-gen) use the same UI and APIs; install is often simpler (`sudo bash install-on-pistomp.sh` without chroot). See [PI-STOMP-VARIANTS.md](./PI-STOMP-VARIANTS.md).

---

## What “100% compatible” means here

| Area | Headless acoustic behavior |
|------|----------------------------|
| **Deploy** | Mac `scp` → `stage-on-boot-firmware.sh` → `overlayroot-chroot` → `install-on-pistomp.sh` → reboot/power-cycle |
| **MOD control** | LIVE stomps, sliders, pedalboard load, snapshots via nginx `:8080` + WebSocket |
| **Stomps** | Host `:bypass` + native ports; no `/reset/` in QA probes |
| **Hardware gain** | `/pistomp/audio/` — ALSA (e.g. Aux input gain) |
| **WiFi admin** | Hotspot ↔ router; **Configure WiFi**; mode survives reboot when installed in chroot (**1.0.0** / 0.2.15+ API) |
| **WiFi persist** | `/boot/firmware/pistomp-mobile/wifi-mode.json` + `pistomp-wifi-mode-apply.service` on real `/opt` |
| **Phone URL** | `http://pistomp.local:8080` or `http://172.24.1.1:8080`; Host field empty |

---

## Headless acoustic image traits

- **overlayroot** — live SSH writes RAM; persistent install must use **chroot** onto `/media/root-ro`
- **Staging** — `/boot/firmware/pistomp-deploy/` on FAT (`mmcblk0p1`), not overlay `/boot/pistomp-deploy`
- **Chroot copy** — from `/proc/1/root/boot/firmware/pistomp-deploy/…`
- **No patchbox WiFi scripts** — WiFi uses pi-stomp `modalapi/wifi/ops` NM paths + `wifi-hotspot.service`
- **Post-chroot `scp`** — `sudo chown -R pistomp:pistomp ~/Pistomp-Mobile` if permission denied

---

## Post-install verification (copy/paste)

On the Pi after reboot or power-cycle:

```bash
grep -n '"running" in stdout' /opt/pistomp-mobile/pistomp-wifi-api.py | head -1
systemctl is-active pistomp-wifi-api pistomp-wifi-mode-apply nginx
curl -s http://127.0.0.1:8080/reset/
curl -s http://127.0.0.1:8080/pistomp/wifi/status | head -c 200
cat /boot/firmware/pistomp-mobile/wifi-mode.json
```

Phone: Settings → version **1.0.0**, badge **LIVE**, Admin WiFi matches expected mode.

---

## Release lineage

| Tag | Note |
|-----|------|
| v0.2.6-rc1 | Stomp polarity, live control |
| v0.2.12–v0.2.14 | WiFi admin, overlay deploy docs, UI polish |
| v0.2.15 | WiFi boot-apply fix; hotspot without patchbox scripts |
| **v1.0.0** | **Milestone** — headless acoustic compatibility declared |

---

## Install doc

Full steps: **[DEPLOYMENT.md](../DEPLOYMENT.md)** — section *Read-only root (overlayroot)*.
