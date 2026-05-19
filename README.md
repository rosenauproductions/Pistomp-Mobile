# Pistomp-Mobile

Lightweight, mobile-first web UI for [Pi-Stomp](https://github.com/TreeFallSound/pi-stomp). Controls pedalboards, effect bypass, snapshots (A/B), and quick tuner/gain/master sliders over the MOD-UI HTTP API.

## Features

- Pedalboard list and load
- Scrollable 2×2 effect grid with stomp-style footswitches and per-effect settings (⚙)
- Save pedalboard when bypass or parameters change (LIVE mode)
- Snapshot A/B switching
- Auto-detected gain and master sliders (when present on the board)
- Tuner on/off via the effect grid (MOD-UI does not expose live note readout over HTTP)
- LIVE / DEMO mode with configurable Pi host
- PWA manifest (Add to Home Screen)
- Pi install script (nginx on port 8080, proxies to MOD-UI)

## Quick start

```bash
npm install
npm run dev
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Pi-Stomp installation.

## Default host

`http://172.24.1.1` (Pi-Stomp hotspot). After nginx install, use `http://172.24.1.1:8080`.
