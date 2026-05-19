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
scp -r Pistomp-Mobile pi@172.24.1.1:/home/pi/
```

**3. On the Pi** — install (requires `dist/` from step 1):

```bash
ssh pi@172.24.1.1
cd ~/Pistomp-Mobile
sudo bash install-on-pistomp.sh
```

**4. On your phone** — join the Pi-Stomp hotspot, then open:

**http://172.24.1.1:8080**

Leave the connection **Host** field empty in app settings (gear icon) so API calls use the nginx proxy.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for SCP/SFTP options, troubleshooting, updates, and uninstall.

---

## Develop locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. Uses **DEMO** data unless MOD-UI is reachable on port 80 (Vite proxies API paths in dev).

---

## How it works

- **MOD-UI** on the Pi (port 80) is the effect engine API.
- **Pistomp-Mobile** (port 8080 via nginx) is a thin mobile controller.
- Your phone connects to the Pi hotspot — **no internet required**.

---

## License

Same spirit as Pi-Stomp / MOD ecosystem — use and modify for personal DIY builds. See [TreeFallSound/pi-stomp](https://github.com/TreeFallSound/pi-stomp) for the hardware platform.
