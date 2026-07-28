# Changelog

## Unreleased

### Install

- **Fix:** Fresh `apt install nginx` on vanilla Pi-Stomp — disable Debian default `:80` site (MOD-UI owns port 80), `enable`/`start` nginx instead of reload-only, post-install `:8080` verify
- **Docs:** DEPLOYMENT troubleshooting for nginx not active; use update script when `~/Pistomp-Mobile` already exists
- **Deb packaging:** `debian/` + `packaging/` + `scripts/build-deb.sh`; installer prefers `.deb` when available, keeps git/script file-copy for new users

### UI

- **Snapshots:** Show all pedalboard snapshots in a horizontal scroll strip (was capped at A/B only)
- **Effect grid:** Order pedals by MOD signal flow (`connections` + `x`/`y`), stable on every refresh
- **Display:** Portrait / Landscape / 90° / −90° (landscape layout; in-slot pedal spin for ±90)
- **Settings:** Toggle to hide effects with no MIDI assignment (bypassCC / port midiCC from MOD info; default off)
- **Settings:** Shutdown Pi-Stomp (same `systemctl poweroff` as the LCD system menu; confirm tap)

Work in progress on `main` (target **1.2.1**). Stable **1.2.0** is tag `v1.2.0`; **1.1.0** remains on `v1.1.0` / `release/1.1.x` for hotfixes only.

## 1.2.0 (2026-06-12)

- **Connect:** No `reset`/`load_bundle` on app open — mirror live MOD; use **Change pedalboard** or Advanced **Reload** to force load
- **ALSA:** `pistomp-audio-api` uses pi-stomp `audiocard` + `alsactl store` to `/var/lib/alsa/asound.state`; sliders only in Settings → Admin
- **Git install:** Prebuilt `dist/` in repo; `scripts/install-pistomp-mobile.sh` and `scripts/update-pistomp-mobile.sh` on the Pi (vanilla + overlayroot)

Verified on vanilla Pi-Stomp and headless acoustic (git clone + update workflow).

## 1.1.0 (2026-06-03)

- **Pi device:** Offline mode instead of demo when MOD unreachable; connection status bar and load banner
- **Settings:** Network URL hints, Advanced (install health check, QA); Host URL hidden on Pi
- **UI:** Long effect names truncate with fade; home screen name **PiStomp-Mobile**
- **Install:** Vanilla monolithic nginx (`pistomp-mobile-8080.conf`); asset cleanup and no-store cache headers
- **Docs:** DEPLOYMENT vanilla vs headless chooser

Verified on vanilla Pi-Stomp and headless acoustic (overlayroot).

## 1.0.0 (2026-06-03) — Headless acoustic milestone

**Major release:** Pistomp-Mobile is field-verified **100% compatible** with the **headless acoustic** Pi-Stomp build (overlayroot, locked SD, power-cycle tested).

- Documented reference platform: [docs/MILESTONE-HEADLESS-ACOUSTIC.md](./docs/MILESTONE-HEADLESS-ACOUSTIC.md)
- Verified: LIVE MOD control, WiFi hotspot/router + reboot persistence (chroot install), ALSA admin, overlay deploy workflow
- Includes all fixes through **0.2.15** (WiFi boot apply, hotspot without patchbox scripts)

Vanilla Pi-Stomp images remain supported; see [docs/PI-STOMP-VARIANTS.md](./docs/PI-STOMP-VARIANTS.md).

## 0.2.15 (2026-06-03)

- **Fix:** WiFi boot apply crashed (`wait_for_network_manager` bytes/string).
- **Fix:** Hotspot mode on images without patchbox scripts — always run NM `enable_hotspot` + start `wifi-hotspot.service`, disconnect router first; return error if AP still not active.

## 0.2.14 (2026-06-02)

- **WiFi:** Persist mode like pi-stomp (patchbox scripts + NM) and write to **FAT** `/boot/firmware/pistomp-mobile/wifi-mode.json` plus real SD via `/proc/1/root` (overlayroot). Copies NM profiles and disables `wifi-hotspot.service` on SD for router mode.
- **Admin:** Input toggle is a slide switch — **Show Volume Slider?**
- **Settings:** QA report collapsed by default (**Show QA report**).

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
