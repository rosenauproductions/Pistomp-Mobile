# Pistomp-Mobile

Lightweight, mobile-first web UI for [Pi-Stomp](https://github.com/TreeFallSound/pi-stomp). Control pedalboards, effect bypass, snapshots (A/B), gain/master sliders, and per-effect parameters over the MOD-UI HTTP API — optimized for phone use on the Pi’s Wi‑Fi hotspot.

**Repository:** https://github.com/rosenauproductions/Pistomp-Mobile

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

Full step-by-step guide: **[DEPLOYMENT.md](./DEPLOYMENT.md)**

### Quick version

**1. On your Mac/PC** — build the app:

```bash
git clone https://github.com/rosenauproductions/Pistomp-Mobile.git
cd Pistomp-Mobile
npm install
npm run build
```

**2. Copy build to the Pi** (see [DEPLOYMENT.md](./DEPLOYMENT.md) for overlayroot staging + chroot):

```bash
scp -r dist install-on-pistomp.sh scripts \
  pistomp@pistomp.local:/home/pistomp/Pistomp-Mobile/
```

If `scp` fails with permission denied after a chroot install:  
`ssh pistomp@pistomp.local "sudo chown -R pistomp:pistomp /home/pistomp/Pistomp-Mobile"`

On the Pi: `~/pi-stomp/` (firmware) and `~/Pistomp-Mobile/` (this UI) are **sibling folders**. The Pi copy is **not** a git repo.

Default SSH: **`pistomp`** / **`pistomp`**. Phone/UI: **http://pistomp.local:8080**

**3. On the Pi** — overlayroot install + reboot:

```bash
ssh pistomp@pistomp.local
sudo overlayroot-chroot
cd /home/pistomp/Pistomp-Mobile && bash install-on-pistomp.sh
exit
sudo reboot
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
