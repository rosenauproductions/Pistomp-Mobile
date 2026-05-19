# Installing Pistomp-Mobile on Pi-Stomp

This guide walks through putting the mobile web UI on your Pi-Stomp so you can control it from a phone over the built-in Wi‑Fi hotspot — **no internet required**.

## What you are installing

| Piece | Purpose |
|-------|---------|
| **Static web app** (`dist/`) | The mobile UI (HTML/JS/CSS) |
| **nginx on port 8080** | Serves the app and proxies API calls to MOD-UI |
| **MOD-UI (already on Pi-Stomp)** | Runs on port **80** — pedalboards, effects, snapshots |

The phone talks only to the Pi. nginx forwards `/pedalboard/*`, `/effect/*`, `/snapshot/*`, and `/websocket` to MOD-UI on `127.0.0.1:80`, so the browser stays same-origin and nothing needs CORS hacks.

---

## Prerequisites

### On your computer (Mac, Windows, or Linux)

- [Node.js](https://nodejs.org/) 18+ and `npm`
- Git (optional, for cloning the repo)
- A way to copy files to the Pi: **SCP**, **SFTP** (Cyberduck, FileZilla), or a USB drive

### On the Pi-Stomp

- Pi-Stomp OS image with **MOD-UI** running (default on port 80)
- SSH access to the Pi (same network or hotspot)
- `sudo` privileges

You do **not** need Node.js on the Pi if you build on your computer and copy the `dist/` folder.

### Can it be built on the Pi?

**Yes**, if Node.js 18+ and npm are installed. Standard Pi-Stomp images do **not** ship with Node — you install it once.

| | Build on computer | Build on Pi |
|---|-------------------|-------------|
| **Speed** | Fast | Slower (compile on ARM) |
| **Internet** | Only for `npm install` on PC | Required at least once for Node + npm |
| **Hotspot-only** | Works (copy `dist/` via SCP/USB) | Hard — `npm install` usually needs WAN |
| **Recommended** | ✅ Yes | Optional / tinkerers |

If you only have the Pi and no PC, use [Build on the Pi](#build-on-the-pi-instead) below — connect the Pi to your home Wi‑Fi (not hotspot) for the one-time `npm install`, then switch back to hotspot for phone use.

---

## Step 1 — Get the project on your computer

```bash
git clone https://github.com/rosenauproductions/Pistomp-Mobile.git
cd Pistomp-Mobile
```

Or download a ZIP from GitHub and extract it.

---

## Step 2 — Build the production app

On your computer, in the project folder:

```bash
npm install
npm run build
```

This creates a `dist/` folder with the compiled site. The install script requires `dist/` to exist.

**Check:** you should see `dist/index.html` and `dist/assets/`.

---

## Build on the Pi instead

Skip copying `dist/` from a PC — clone and build directly on the device.

### 1. Install Node.js (one time, needs internet)

SSH into the Pi on your **home network** (Ethernet or Wi‑Fi with internet — not the phone hotspot):

```bash
node -v   # if this prints v18+ or v20+, skip to step 2
```

**Debian / Raspberry Pi OS / Pi-Stomp (apt):**

```bash
sudo apt-get update
sudo apt-get install -y nodejs npm
node -v
npm -v
```

If `node -v` is below 18, use [NodeSource](https://github.com/nodesource/distributions) or install `nvm`, then Node 20 LTS.

### 2. Clone and build

```bash
cd ~
git clone https://github.com/rosenauproductions/Pistomp-Mobile.git
cd Pistomp-Mobile
npm install
npm run build
```

Build may take a few minutes on a Pi. Confirm `dist/index.html` exists.

### 3. Install nginx site

```bash
sudo bash install-on-pistomp.sh
```

### 4. Phone

Join the Pi-Stomp hotspot → **http://172.24.1.1:8080**

Future updates on the Pi:

```bash
cd ~/Pistomp-Mobile
git pull
npm install
npm run build
sudo bash install-on-pistomp.sh
```

---

## Step 3 — Copy the project to the Pi

*(Skip this section if you used [Build on the Pi instead](#build-on-the-pi-instead).)*

Copy the **entire project folder** (or at minimum: `dist/`, `install-on-pistomp.sh`, and this guide).

### Option A — SCP (recommended)

Replace `pi` and `pistomp.local` with your Pi’s SSH user and hostname/IP.

```bash
# From your computer, inside the parent of Pistomp-Mobile:
scp -r Pistomp-Mobile pi@pistomp.local:/home/pi/
```

If you are already on the Pi’s hotspot:

```bash
scp -r Pistomp-Mobile pi@172.24.1.1:/home/pi/
```

### Option B — SFTP

Connect with Cyberduck, FileZilla, or VS Code “Remote - SSH” and upload the `Pistomp-Mobile` folder to `/home/pi/`.

### Option C — USB

Copy the folder to a USB stick, plug it into the Pi, and copy to `/home/pi/Pistomp-Mobile`.

---

## Step 4 — SSH into the Pi

```bash
ssh pi@pistomp.local
# or, on hotspot:
ssh pi@172.24.1.1
```

Default Pi-Stomp hotspot gateway is **`172.24.1.1`** (phones get addresses in `172.24.1.50–150`).

---

## Step 5 — Run the install script

On the Pi:

```bash
cd ~/Pistomp-Mobile
chmod +x install-on-pistomp.sh
sudo bash install-on-pistomp.sh
```

The script will:

1. Install files to `/opt/pistomp-mobile/dist/`
2. Install **nginx** if it is not already present
3. Add an nginx site listening on **port 8080**
4. Proxy MOD-UI API paths to `http://127.0.0.1:80`
5. Reload nginx

**Expected output:** `Done. Open http://172.24.1.1:8080 from your phone...`

### If the script fails

| Error | Fix |
|-------|-----|
| `Missing ./dist` | Run `npm run build` on your computer and copy `dist/` again |
| `Run as root` | Use `sudo bash install-on-pistomp.sh` |
| `nginx -t` fails | Another site may conflict on port 8080; edit `/etc/nginx/sites-available/pistomp-mobile` |
| MOD-UI not responding | See [Troubleshooting](#troubleshooting) |

---

## Step 6 — Confirm MOD-UI is running

On the Pi:

```bash
curl -s http://127.0.0.1/pedalboard/list | head -c 200
```

You should see JSON (a list of pedalboards). If this fails, Pistomp-Mobile cannot control the device until MOD-UI is up:

```bash
sudo systemctl status mod-ui
# if needed:
sudo systemctl start mod-ui
```

---

## Step 7 — Use it on your phone

1. On the Pi-Stomp, enable the **Wi‑Fi hotspot** (if not already on).
2. On your phone, join the Pi-Stomp Wi‑Fi network.
3. Open a browser and go to:

   **http://172.24.1.1:8080**

4. You should see the Pistomp-Mobile UI. The badge should say **LIVE** when MOD-UI is reachable.

### Connection settings (gear icon)

After this install, leave the **Host URL field empty** in settings. That uses same-origin requests through nginx on port 8080 (recommended).

Only set a custom host if you are testing from a dev machine with Vite, or serving the app somewhere else.

### Add to Home Screen (optional PWA)

- **iPhone (Safari):** Share → **Add to Home Screen**
- **Android (Chrome):** Menu → **Install app** or **Add to Home Screen**

Works offline for the UI shell after the first load; control still requires the Pi hotspot.

---

## Updating after a new release

On your computer:

```bash
cd Pistomp-Mobile
git pull
npm install
npm run build
scp -r dist pi@172.24.1.1:/home/pi/Pistomp-Mobile/
```

On the Pi:

```bash
cd ~/Pistomp-Mobile
sudo bash install-on-pistomp.sh
```

---

## Install layout (reference)

| Path | Contents |
|------|----------|
| `/opt/pistomp-mobile/dist/` | Built web app |
| `/etc/nginx/sites-available/pistomp-mobile` | nginx config |
| `/etc/nginx/sites-enabled/pistomp-mobile` | Symlink to enable site |

To remove later:

```bash
sudo rm -rf /opt/pistomp-mobile
sudo rm /etc/nginx/sites-enabled/pistomp-mobile
sudo rm /etc/nginx/sites-available/pistomp-mobile
sudo systemctl reload nginx
```

---

## Troubleshooting

### Page loads but badge says DEMO

- Phone cannot reach MOD-UI through the proxy.
- Confirm you opened **`:8080`**, not only `http://172.24.1.1` (port 80 is full MOD-UI desktop).
- In settings, clear the host field and tap **Save & reconnect**.
- On the Pi: `curl http://127.0.0.1/pedalboard/list`

### Save or bypass does nothing

- Must be **LIVE** mode, not DEMO.
- Check MOD-UI: `sudo journalctl -u mod-ui -f` while toggling an effect.

### WebSocket / footswitch sync lag

- Normal on Wi‑Fi; WebSocket reconnects every few seconds if dropped.

### `pistomp.local` does not resolve

- Use **`172.24.1.1`** on the hotspot.
- On your home LAN, try the Pi’s LAN IP instead.

### Port 8080 already in use

Edit `/etc/nginx/sites-available/pistomp-mobile`, change `listen 8080` to another port (e.g. `8081`), then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Open `http://172.24.1.1:8081` on your phone.

---

## Development on your computer

```bash
npm run dev
```

Open http://localhost:5173. Vite proxies API paths to `http://127.0.0.1:80` if MOD-UI is running locally.

Without MOD-UI, the app runs in **DEMO** mode with sample data.

---

## Network summary

```
Phone  →  http://172.24.1.1:8080  →  nginx
                                      ├─ /              →  /opt/pistomp-mobile/dist/
                                      └─ /pedalboard/*  →  MOD-UI :80
                                          /effect/*
                                          /snapshot/*
                                          /websocket
```

No cloud, no app store — just the Pi and your phone.
