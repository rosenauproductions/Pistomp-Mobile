# Changelog

## 0.2.13 (2026-06-02)

- **WiFi:** Router/hotspot mode persists across reboot — saves preference under `/home/pistomp/data/`, sets NetworkManager autoconnect flags, disables `wifi-hotspot.service` in router mode, applies on boot via `pistomp-wifi-mode-apply.service`.

## 0.2.12 (2026-06-02)

- **Fix:** Settings checkbox layout — full-width input styles no longer stretch Admin checkboxes; checkbox left, label text immediately to the right.
- **UI:** Removed redundant host-hint paragraph above Host URL in Settings.

## 0.2.11 (2026-06-02)

- **UI:** Removed host-hint copy above Host URL (use same-origin `:8080`).

## 0.2.10 (2026-06-02)

- **Admin:** **Input controls** subsection with labeled toggle for main-screen input gain slider.

## 0.2.9 (2026-06-02)

- **Admin → Configure WiFi:** Set hotspot SSID/password and home router SSID/password (`POST /pistomp/wifi/configure`).
- **Backend:** `scripts/pistomp-wifi-api.py` — credentials from NetworkManager, saved networks list, router connect.
- **Deploy:** `scripts/stage-on-boot-firmware.sh` for overlayroot staging on `/boot/firmware/pistomp-deploy/`.
- **Docs:** `DEPLOYMENT.md` verified overlayroot workflow (`/proc/1/root/boot/firmware/…`).

## 0.2.8 (2026-06-02)

- **Admin:** WiFi section first; large hotspot/router mode buttons.
- **Admin:** Toggle to show/hide hardware input gain slider on main screen (`adminPrefs`).
- **Header:** Reconnect (↻) when connection is offline.

## 0.2.7 (2026-06-02)

- **Admin → WiFi:** Hotspot ↔ router mode via `pistomp-wifi-api` (port 8767), nginx `/pistomp/wifi/`, systemd unit.
- **Install:** `install-on-pistomp.sh` installs WiFi API and nginx proxy.

## 0.2.6 — RC1

- Stomp bypass polarity fix (host `:bypass` + native ports).
- QA no longer calls `/reset/`; connection offline badge; empty-board warning.
