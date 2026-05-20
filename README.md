# Pistomp-Mobile

Lightweight, mobile-first web UI for [Pi-Stomp](https://github.com/TreeFallSound/pi-stomp). Control pedalboards, effect bypass, snapshots (A/B), gain/master sliders, and per-effect parameters over the MOD-UI HTTP API — optimized for phone use on the Pi’s Wi‑Fi hotspot.

**Repository:** https://github.com/rosenauproductions/Pistomp-Mobile

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

---

## Install on Pi-Stomp (summary)

Full step-by-step guide: **[DEPLOYMENT.md](./DEPLOYMENT.md)**

### Quick version

**1. On your Mac/PC** — build the app:

```bash
git clone https://github.com/rosenauproductions/Pistomp-Mobile.git
cd Pistomp-Mobile
npm install
npm run build
```

**2. Copy to the Pi** (example):

```bash
scp -r Pistomp-Mobile pistomp@pistomp.local:/home/pistomp/
```

On the Pi you will have `~/pi-stomp/` (firmware) and `~/Pistomp-Mobile/` (this UI) as **sibling folders**. Install from **`~/Pistomp-Mobile`** only.

Default SSH login on many Pi-Stomp images: **`pistomp`** / **`pistomp`**. If `.local` does not resolve, use **`172.24.1.1`** on the hotspot.

**3. On the Pi** — install (requires `dist/` from step 1).

Typical update: `scp -r dist` → `~/Pistomp-Mobile/`, then overlayroot + `install-on-pistomp.sh`. See [DEPLOYMENT.md](./DEPLOYMENT.md#quick-workflow-copy-dist-only).

```bash
ssh pistomp@pistomp.local
sudo overlayroot-chroot
cd /home/pistomp/Pistomp-Mobile && bash install-on-pistomp.sh
exit
sudo systemctl reload nginx
```

**4. On your phone** — join the Pi-Stomp hotspot, then open:

**http://pistomp.local:8080**

Leave the connection **Host** field empty in app settings (gear icon) so API calls use the nginx proxy.

**Build on the Pi?** Yes — install Node 18+ on the Pi, `git clone`, `npm install`, `npm run build`, then run the install script. Easiest path is still build on a computer and copy `dist/` (hotspot has no internet for npm). Details in [DEPLOYMENT.md](./DEPLOYMENT.md).

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
