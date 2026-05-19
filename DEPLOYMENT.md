# Deploying Pistomp-Mobile on Pi-Stomp

## Build (on your computer)

```bash
cd Pistomp-Mobile
npm install
npm run build
```

Copy the whole project folder to the Pi (including `dist/` and `install-on-pistomp.sh`).

## Install (on the Pi)

```bash
cd Pistomp-Mobile
sudo bash install-on-pistomp.sh
```

This serves the app on **port 8080** and proxies MOD-UI API paths to **port 80**.

## Phone usage

1. Connect to the Pi-Stomp Wi‑Fi hotspot.
2. Open **http://172.24.1.1:8080** (default hotspot gateway).
3. Optional: **Add to Home Screen** for a full-screen app icon.

## Connection settings

In the app (gear icon), set the host to:

- `http://172.24.1.1` — hotspot (default)
- `http://172.24.1.1:8080` — only if you proxy through nginx on 8080 (recommended install uses same origin, so use `http://172.24.1.1:8080` as the host when installed via this script)

When installed behind nginx on `:8080`, set the host URL to **`http://172.24.1.1:8080`** so API calls stay same-origin through the proxy.

## Development

```bash
npm run dev
```

Uses demo data unless MOD-UI is reachable (Vite proxies `/pedalboard`, `/effect`, `/snapshot` to port 80).
