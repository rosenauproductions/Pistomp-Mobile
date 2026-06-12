# Pistomp-Mobile

Lightweight, mobile-first web UI for [Pi-Stomp](https://github.com/TreeFallSound/pi-stomp). Control pedalboards, effect bypass, snapshots (A/B), gain/master sliders, and per-effect parameters over the MOD-UI HTTP API — optimized for phone use on the Pi’s Wi‑Fi hotspot.

**Repository:** https://github.com/rosenauproductions/Pistomp-Mobile

**v1.0.0** — Field-verified on **headless acoustic** Pi-Stomp (overlayroot). See [docs/MILESTONE-HEADLESS-ACOUSTIC.md](./docs/MILESTONE-HEADLESS-ACOUSTIC.md).

Release notes: **[CHANGELOG.md](./CHANGELOG.md)**

## Features

- Pedalboard list and load
- Scrollable 2×2 effect grid with chrome **momentary** stomp switches (LED = on/off state)
- Per-effect settings (⚙) with parameter sliders
- Save pedalboard when bypass or parameters change (LIVE mode)
- Snapshot A/B switching
- Plugin-category colors on each pedal (from MOD metadata)
- LIVE / DEMO mode with configurable Pi host
- PWA manifest (Add to Home Screen)
- One-command Pi install via nginx
- Settings → **Admin**: Wi‑Fi hotspot/router mode, **Configure WiFi** (SSID/password), optional main-screen input gain slider, ALSA input control

---

## Install on Pi-Stomp (summary)

Full guide: **[DEPLOYMENT.md](./DEPLOYMENT.md)**

### Easiest — git on the Pi (no Mac, no Node)

Connect the Pi to home Wi‑Fi once, then:

```bash
git clone https://github.com/rosenauproductions/Pistomp-Mobile.git ~/Pistomp-Mobile
cd ~/Pistomp-Mobile
bash scripts/install-pistomp-mobile.sh --reboot
```

Updates:

```bash
cd ~/Pistomp-Mobile
bash scripts/update-pistomp-mobile.sh --reboot
```

The repo includes **prebuilt `dist/`**. `~/pi-stomp/` (firmware) and `~/Pistomp-Mobile/` (this UI) are sibling folders.

Default SSH: **`pistomp`** / **`pistomp`**. Phone: **http://pistomp.local:8080** — leave **Host** empty in settings.

### Alternative — build on Mac and SCP

```bash
git clone https://github.com/rosenauproductions/Pistomp-Mobile.git
cd Pistomp-Mobile && npm install && npm run build
scp -r dist install-on-pistomp.sh scripts pistomp@pistomp.local:/home/pistomp/Pistomp-Mobile/
```

Headless overlayroot staging + chroot: [DEPLOYMENT.md](./DEPLOYMENT.md).

See [DEPLOYMENT.md](./DEPLOYMENT.md) for SCP/SFTP options, build-on-Pi steps, troubleshooting, updates, and uninstall.

---

## Develop locally

```bash
npm install
npm run dev          # MOD Desktop :18181 (local emulator QA)
npm run dev:pistomp  # Pi-Stomp MOD-UI :80 (tunnel or device)
```

Open http://localhost:5173. In dev, use **Settings → Runtime** to switch **MOD Desktop** vs **Pi-Stomp** behavior (production on the Pi is always Pi-Stomp).

See [docs/MOD-DESKTOP-VS-PISTOMP.md](./docs/MOD-DESKTOP-VS-PISTOMP.md) for what must not ship on the device.

---

## How it works

- **MOD-UI** on the Pi (port 80) is the effect engine API.
- **Pistomp-Mobile** (port 8080 via nginx) is a thin mobile controller.
- Your phone connects to the Pi hotspot — **no internet required**.

---

## License

Same spirit as Pi-Stomp / MOD ecosystem — use and modify for personal DIY builds. See [TreeFallSound/pi-stomp](https://github.com/TreeFallSound/pi-stomp) for the hardware platform.
