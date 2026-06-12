# Installing Pistomp-Mobile on Pi-Stomp

This guide walks through putting the mobile web UI on your Pi-Stomp so you can control it from a phone over the built-in Wi‑Fi hotspot — **no internet required**.

## Which Pi-Stomp image do you have?

| Your build | Install path in this guide |
|------------|----------------------------|
| **Vanilla Pi-Stomp** (writable SD, full PCB, Cam-style image) | [Writable root (vanilla)](#writable-root-unusual) — Mac `scp` → `sudo bash install-on-pistomp.sh` |
| **Headless acoustic** (overlayroot, locked SD) | [Read-only root (overlayroot)](#read-only-root-overlayroot--locked-sd--verified-workflow) — stage on FAT → chroot → reboot |

Same Mac build (`npm run build`) for both. Details: [docs/PI-STOMP-VARIANTS.md](./docs/PI-STOMP-VARIANTS.md).

**v1.0.0+** is verified on **headless acoustic**; **vanilla** uses the same app with the simpler install path above. Headless milestone checklist: [docs/MILESTONE-HEADLESS-ACOUSTIC.md](./docs/MILESTONE-HEADLESS-ACOUSTIC.md).

## Easiest install — git on the Pi (recommended)

The repo includes a **prebuilt `dist/`** — no Mac, no Node.js on the Pi. Connect the Pi to **home Wi‑Fi** once for `git clone` (or use Ethernet).

### First install

```bash
cd ~
git clone https://github.com/rosenauproductions/Pistomp-Mobile.git
cd Pistomp-Mobile
bash scripts/install-pistomp-mobile.sh --reboot
```

| Image | What the script does |
|-------|----------------------|
| **Vanilla** (writable SD) | `sudo bash install-on-pistomp.sh` |
| **Headless** (overlayroot) | Stage on `/boot/firmware` → chroot install → **reboot** |

After reboot, open **http://pistomp.local:8080** on the Pi hotspot. Leave **Host** empty in app settings.

### Updates

On home Wi‑Fi (or any network with GitHub access):

```bash
cd ~/Pistomp-Mobile
bash scripts/update-pistomp-mobile.sh --reboot
```

Pin a release tag instead of tracking `main`:

```bash
bash scripts/update-pistomp-mobile.sh --tag v1.1.0 --reboot
```

`--reboot` is optional on vanilla; on headless it is required so nginx and systemd pick up the install.

### Requirements

- `git` on the Pi (`sudo apt-get install -y git` if missing)
- `sudo` (password often same as login, e.g. `pistomp` / `pistomp`)
- Internet **only** for clone/pull — phone control still works on hotspot with no WAN

---

## What you are installing

| Piece | Purpose |
|-------|---------|
| **Static web app** (`dist/`) | The mobile UI (HTML/JS/CSS) |
| **nginx on port 8080** | Serves the app and proxies API calls to MOD-UI |
| **MOD-UI (already on Pi-Stomp)** | Runs on port **80** — pedalboards, effects, snapshots |
| **pistomp-audio-api** (port 8766) | Hardware ALSA gain via `/pistomp/audio/` |
| **pistomp-wifi-api** (port 8767) | Hotspot ↔ router toggle via `/pistomp/wifi/` (Settings → Admin) |

The phone talks only to the Pi. nginx forwards `/pedalboard/*`, `/effect/*`, `/snapshot/*`, and `/websocket` to MOD-UI on `127.0.0.1:80`, so the browser stays same-origin and nothing needs CORS hacks.

**WiFi admin (Settings → Admin):** Toggles between Pi **hotspot** (`pistomp` / `pistompwifi`) and **router** mode (same NM logic as the Pi-Stomp System menu). Persists to **`/boot/firmware/pistomp-mobile/wifi-mode.json`** and **`/opt/pistomp-mobile/`** when installed via chroot (**1.0.0** / 0.2.15+ API). Reapplies on boot via `pistomp-wifi-mode-apply.service`. Requires full `install-on-pistomp.sh` (not `dist/` only). See [docs/PI-STOMP-VARIANTS.md](./docs/PI-STOMP-VARIANTS.md). Switching modes disconnects the phone briefly.

After install, verify: `curl -s http://127.0.0.1:8080/pistomp/wifi/status`

### Directory layout on the Pi (two folders)

On a typical Pi-Stomp home directory you have **both**:

| Path | What it is |
|------|------------|
| `~/pi-stomp/` | Pi-Stomp **firmware** (MOD handler, LCD, ALSA, `run_mobile.sh`, etc.) |
| `~/Pistomp-Mobile/` | **Mobile web UI** git clone (`dist/`, `install-on-pistomp.sh`, `scripts/install-pistomp-mobile.sh`) |

They are separate projects. **Install and update the phone UI only from `~/Pistomp-Mobile`**. The git repo ships **prebuilt `dist/`**; Mac `npm run build` is only needed for development.

Do not run `install-on-pistomp.sh` from `~/pi-stomp` unless you also copied `dist/` and the install scripts there.

Installed files live under **`/opt/pistomp-mobile/dist/`** (nginx), not inside `~/pi-stomp`.

---

## Prerequisites

### On your computer (Mac, Windows, or Linux)

- [Node.js](https://nodejs.org/) 18+ and `npm`
- Git (optional, for cloning the repo)
- A way to copy files to the Pi: **SCP**, **SFTP** (Cyberduck, FileZilla), or a USB drive

### On the Pi-Stomp

- Pi-Stomp OS image with **MOD-UI** running (default on port 80)
- SSH access to the Pi (same network or hotspot)
- Default login on many images: user **`pistomp`**, password **`pistomp`** (change if your image differs)
- `sudo` privileges (same password often works for `sudo`)

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

## Step 1 — Get the project

**On the Pi (easiest):** see [Easiest install — git on the Pi](#easiest-install--git-on-the-pi-recommended) above.

**On your computer (for development or SCP deploy):**

```bash
git clone https://github.com/rosenauproductions/Pistomp-Mobile.git
cd Pistomp-Mobile
```

Or download a ZIP from GitHub and extract it.

---

## Step 2 — Build the production app (developers only)

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

Join the Pi-Stomp hotspot → **http://pistomp.local:8080**

Future updates on the Pi (with prebuilt `dist/` in git):

```bash
cd ~/Pistomp-Mobile
bash scripts/update-pistomp-mobile.sh --reboot
```

Or build from source on the Pi (needs Node + npm):

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

Default SSH user is **`pistomp`**. On the Pi-Stomp hotspot, **`pistomp.local`** usually resolves via mDNS (same as SSH/SCP).

```bash
# From your computer, inside the parent of Pistomp-Mobile:
scp -r Pistomp-Mobile pistomp@pistomp.local:/home/pistomp/
```

If `pistomp.local` does not resolve, use the hotspot gateway IP:

```bash
scp -r Pistomp-Mobile pistomp@172.24.1.1:/home/pistomp/
```

(`scp` will prompt for the password unless you use SSH keys.)

### Option B — SFTP

Connect with Cyberduck, FileZilla, or VS Code “Remote - SSH” and upload the `Pistomp-Mobile` folder to `/home/pistomp/`.

### Option C — USB

Copy the folder to a USB stick, plug it into the Pi, and copy to `/home/pistomp/Pistomp-Mobile`.

---

## Step 4 — SSH into the Pi

```bash
ssh pistomp@pistomp.local
```

If `.local` fails: `ssh pistomp@172.24.1.1` (hotspot gateway; phones get `172.24.1.50–150`).

---

## Step 5 — Run the install script

### Read-only root (overlayroot / “locked SD”) — verified workflow

Many Pi-Stomp images use **overlayroot**. Three filesystem layers matter:

| Path | What it is |
|------|------------|
| `~/Pistomp-Mobile/` (normal SSH) | **Overlay** (RAM) — Mac `scp` lands here |
| `/boot/pistomp-deploy/` | **Overlay** — do **not** use; chroot cannot see it |
| `/boot/firmware/pistomp-deploy/` | **FAT on SD** (`mmcblk0p1`) — use this staging area |
| `/home/pistomp/…` inside **chroot** | **Real root** on SD — `install-on-pistomp.sh` writes here |

`scp` → `/media/root-ro/…` from the Mac usually **fails** (read-only).  
`rsync` → `/media/root-ro/…` from SSH also **fails** (read-only until chroot).

#### Mac (every update)

```bash
cd ~/Pistomp-Mobile
npm run build
ssh pistomp@pistomp.local "mkdir -p /home/pistomp/Pistomp-Mobile"
scp -r dist install-on-pistomp.sh scripts \
  pistomp@pistomp.local:/home/pistomp/Pistomp-Mobile/
```

#### Pi — stage onto FAT boot (normal SSH, **not** chroot)

```bash
ssh pistomp@pistomp.local
bash ~/Pistomp-Mobile/scripts/stage-on-boot-firmware.sh
# Or manually:
#   sudo mkdir -p /boot/firmware/pistomp-deploy/scripts
#   sudo cp -r ~/Pistomp-Mobile/dist ~/Pistomp-Mobile/install-on-pistomp.sh ~/Pistomp-Mobile/scripts /boot/firmware/pistomp-deploy/
#   ls /boot/firmware/pistomp-deploy/scripts/   # both .py files
#   df -h /boot/firmware/pistomp-deploy         # must show /dev/mmcblk0p1, NOT overlayroot
```

`cp` may warn `failed to preserve ownership` on FAT — **ignore**; files are still copied.

#### Pi — chroot, copy from host mount, install

```bash
sudo overlayroot-chroot
mkdir -p /home/pistomp/Pistomp-Mobile
cp -a /proc/1/root/boot/firmware/pistomp-deploy/dist \
      /proc/1/root/boot/firmware/pistomp-deploy/install-on-pistomp.sh \
      /proc/1/root/boot/firmware/pistomp-deploy/scripts \
      /home/pistomp/Pistomp-Mobile/
ls -la /home/pistomp/Pistomp-Mobile/scripts/   # must list both .py files
cd /home/pistomp/Pistomp-Mobile
bash install-on-pistomp.sh
```

Expect **`Done. Open http://pistomp.local:8080…`** and **no** `scripts/pistomp-wifi-api.py not found`.

Quick check before leaving chroot:

```bash
test -f /opt/pistomp-mobile/pistomp-wifi-api.py && echo wifi-api-ok
grep -q pistomp/wifi /etc/nginx/sites-available/pistomp-mobile && echo nginx-ok
exit
sudo reboot
```

After reboot:

```bash
curl -s http://127.0.0.1:8080/pistomp/wifi/status
systemctl is-active pistomp-wifi-api.service
```

**Why `/proc/1/root/boot/firmware/…`?** Inside chroot, `/boot/firmware` is often empty and `/dev/mmcblk0p1` may be busy (already mounted on the live system). The live mount is visible under the init process root.

**Later updates (dist only, nginx unchanged):** Same staging + chroot copy, then either `bash install-on-pistomp.sh` (full) or `bash update-dist-on-pistomp.sh` if you only changed the UI bundle.

### Writable root (vanilla Pi-Stomp)

If your image is **not** overlayroot (no `overlayroot` in `mount`), a normal install is enough:

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

**Expected output:** `Done. Open http://pistomp.local:8080 from your phone...`

### If the script fails

| Error | Fix |
|-------|-----|
| `Missing ./dist` | Run `npm run build` on your computer and copy `dist/` again |
| `Read-only file system` | Use [overlayroot-chroot](#read-only-root-overlayroot--locked-sd) above |
| `Run as root` | Inside chroot, `bash install-on-pistomp.sh` (root). Outside, `sudo bash install-on-pistomp.sh` |
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

   **http://pistomp.local:8080**

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

### Standard workflow (locked SD / overlayroot)

Use the **[verified overlayroot workflow](#read-only-root-overlayroot--locked-sd--verified-workflow)** above (Mac `scp` → `~/Pistomp-Mobile` → stage on `/boot/firmware/pistomp-deploy/` → chroot copy from `/proc/1/root/boot/firmware/…` → `install-on-pistomp.sh` → reboot).

**Git on the Pi:** use `bash scripts/update-pistomp-mobile.sh` from `~/Pistomp-Mobile`.  
**Mac SCP workflow:** copy `dist/` + scripts without git on the Pi — see [overlayroot workflow](#read-only-root-overlayroot--locked-sd--verified-workflow).

**Check from your Mac** after the Pi is back (must print `true`, not HTML):

```bash
curl -s http://pistomp.local:8080/reset/
curl -s http://pistomp.local:8080/pistomp/wifi/status
```

Phone: **http://pistomp.local:8080** — hard refresh; clear **Host** in settings.

### When nginx / APIs changed

`scp dist` alone does **not** update `/etc/nginx` or `pistomp-wifi-api`. Always copy **`install-on-pistomp.sh`** and **`scripts/`** from the Mac, stage on `/boot/firmware`, then run full `install-on-pistomp.sh` in chroot.

Optional: `update-dist-on-pistomp.sh` for dist-only copies inside chroot when nginx and APIs are already installed.

### Writable-root images (no overlayroot)

```bash
cd ~/Pistomp-Mobile
sudo bash install-on-pistomp.sh
```

---

## Install layout (reference)

| Path | Contents |
|------|----------|
| `/opt/pistomp-mobile/dist/` | Built web app |
| `/opt/pistomp-mobile/pistomp-audio-api.py` | ALSA API (systemd `pistomp-audio-api`) |
| `/opt/pistomp-mobile/pistomp-wifi-api.py` | WiFi hotspot toggle API (systemd `pistomp-wifi-api`) |
| `/boot/firmware/pistomp-deploy/` | Staging copy for overlayroot installs (FAT) |
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
- Confirm you opened **`:8080`**, e.g. `http://pistomp.local:8080` — not port 80 (full MOD-UI desktop).
- In settings, clear the host field and tap **Save & reconnect**.
- On the Pi: `curl http://127.0.0.1/pedalboard/list`

### Save or bypass does nothing

- Must be **LIVE** mode, not DEMO.
- In settings (gear), **clear the Host URL** so requests stay on `:8080` (same origin). A host of `http://pistomp.local` (port 80) while the page is on `:8080` will not control MOD correctly.
- Bypass uses the MOD **WebSocket** (`/websocket`); reinstall or reload nginx after updating so `/reset/` and WebSocket proxy are present.
- Check MOD-UI: `sudo journalctl -u mod-ui -f` while toggling an effect.

### `reset returned HTML` / pedalboards stack

The app calls **`GET /reset/`** before each pedalboard load. If nginx serves the mobile **`index.html`** instead, you see this error and effects **accumulate**.

**Fix:**

1. Mac: `scp install-on-pistomp.sh` to `~/Pistomp-Mobile/` (not only `dist/`).
2. Pi chroot: `cd /home/pistomp/Pistomp-Mobile && bash install-on-pistomp.sh`
3. `exit` then `sudo systemctl reload nginx`
4. Mac: `curl -s http://pistomp.local:8080/reset/` → must be **`true`**

Manual check on Pi: `grep -A3 'location.*reset' /etc/nginx/sites-available/pistomp-mobile` should show `proxy_pass http://127.0.0.1:80` and `Host 127.0.0.1`.

### Bypass / stomps out of sync on `:8080`

- Clear **Host** in app settings (same origin only).
- nginx must proxy **`/websocket`** with `Host 127.0.0.1` (included in current `install-on-pistomp.sh`).
- Hard-refresh the phone page after updating `dist/`.

### Stomps or sliders do nothing (pedalboard change works)

- Pi-Stomp uses MOD’s patched **`/effect/parameter/pi_stomp_set//graph/…`** API (not generic `/effect/parameter/set/`). Current Pistomp-Mobile builds call that on the device.
- Redeploy **`dist/`** only (no nginx change needed for this fix).

### Changes on pistomp.local do not update :8080 immediately

- The app listens on WebSocket `param_set` messages and polls every ~2.5s.
- Reload the mobile page after updating nginx if WebSocket was not proxied before.

### WebSocket / footswitch sync lag

- Normal on Wi‑Fi; WebSocket reconnects every few seconds if dropped.

### `pistomp.local` does not resolve

- On the Pi-Stomp hotspot, try **`http://172.24.1.1:8080`** and **`ssh pistomp@172.24.1.1`** instead.
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

**Releasing UI changes:** `npm run build` then commit `dist/` so Pi users can `git pull` without Node:

```bash
npm run build
git add dist
git commit -m "Rebuild dist for release"
```

---

## Network summary

```
Phone  →  http://pistomp.local:8080  →  nginx
                                      ├─ /              →  /opt/pistomp-mobile/dist/
                                      └─ /pedalboard/*  →  MOD-UI :80
                                          /effect/*
                                          /snapshot/*
                                          /websocket
```

No cloud, no app store — just the Pi and your phone.
