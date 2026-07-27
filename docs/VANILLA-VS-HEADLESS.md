# Vanilla vs headless acoustic — comparison (field probes)

**Purpose:** Handoff for pi-stomp / image devs building a **hardware diff file** and (optionally) moving **vanilla to overlayroot**.  
**Pistomp-Mobile:** Same `dist/` and APIs on both — install path auto-detects overlay vs writable root.

**Probed:** 2026-06 (units labeled by deploy workflow, not SKU serials).

---

## Executive summary

| Question | Answer |
|----------|--------|
| Same **hardware class**? | **Yes** — both `hardware.version: 3.0` (Tre / `Pistomptre`) |
| Same **`default_config.yml` footswitches**? | **Yes** — identical 4× ADC + ledstrip map |
| Same **encoders**? | **No** — vanilla has **3 encoders** (2× KNOB + 1× VOLUME); headless acoustic has **1× VOLUME** only |
| Same **ALSA card**? | **Yes** — IQaudIOCODEC on both |
| Same **OS root**? | **No** — headless **overlay**; vanilla **ext4 writable** |
| Same **nginx layout**? | **No** — headless Debian `sites-available`; vanilla `pistomp-mobile-8080.conf` |
| Can headless-only Pistomp-Mobile behavior live in **hardware diff**? | **Mostly no** — overlay, FAT WiFi pref, chroot install are **image/OS**; encoder map **yes** |

If vanilla adopts overlayroot, **Pistomp-Mobile install converges** (stage → chroot → reboot). **Encoder YAML** and any future `profile: headless` in pi-stomp remain separate.

---

## Side-by-side probe results

| Probe | Headless acoustic | Vanilla (Cam PCB) |
|-------|-------------------|-------------------|
| **Root FSTYPE** | `overlay` | `ext4` |
| **overlayroot** | `overlayroot="tmpfs:swap=1,recurse=0"` | *(not set / disabled)* |
| **nginx** | `/etc/nginx/sites-available/pistomp-mobile` | `/etc/nginx/pistomp-mobile-8080.conf` |
| **ALSA** | IQaudIOCODEC | IQaudIOCODEC |
| **wifi-hotspot.service** | `disabled` | `disabled` |
| **FAT WiFi pref** | `/boot/firmware/pistomp-mobile/wifi-mode.json` → `router` | *none* (`no FAT wifi pref`) |
| **pi-stomp git** | `854a259` | `b2405a6` |
| **hardware.version** | `3.0` | `3.0` |

---

## pi-stomp hardware (`~/data/config/default_config.yml`)

### Identical on both units — footswitches (Tre ADC map)

```yaml
footswitches:
  - id: 0  adc_input: 0  ledstrip_position: 0  midi_CC: 60  longpress: previous_snapshot
  - id: 1  adc_input: 1  ledstrip_position: 1  midi_CC: 61  longpress: next_snapshot
  - id: 2  adc_input: 2  ledstrip_position: 2  midi_CC: 62
  - id: 3  adc_input: 3  ledstrip_position: 3  midi_CC: 63
    longpress: toggle_tap_tempo_enable
    tap_tempo: set_mod_tap_tempo
```

`midi.channel: 14` on both.

### Differs — encoders

**Headless acoustic** (1 encoder):

```yaml
encoders:
  - id: 1
    type: VOLUME
    longpress: system_menu_shutdown
```

**Vanilla** (3 encoders):

```yaml
encoders:
  - id: 1
    midi_CC: 70
    longpress: previous_snapshot
  - id: 2
    midi_CC: 71
    longpress: next_snapshot
  - id: 3
    type: VOLUME
```

**Hardware diff file implication:** A single Tre 3.0 template is not enough — ship **variant encoder blocks** (e.g. `default_config_pistomptre_headless.yml` vs full PCB Tre) or a `profile` key that selects encoder presets. Footswitch block can be **shared**.

**Not in YAML today:** `profile: headless` (no LCD-minimal firmware path). Headless operation today = same `Pistomptre` class + Pistomp-Mobile as remote UI.

---

## Layer ownership (what goes where)

### Image / OS project (not `hardware.version`)

| Behavior | Headless today | Vanilla today | If vanilla → overlay |
|----------|----------------|---------------|----------------------|
| Persistent `/opt`, `/etc/nginx` | chroot → real SD | direct `sudo install` | same as headless |
| Staging | `/boot/firmware/pistomp-deploy/` | optional / unused | required |
| WiFi mode across reboot | FAT `wifi-mode.json` + `/proc/1/root` NM mirror | `~/data/pistomp-mobile-wifi-mode.json` + writable `/etc` | FAT path on both |
| nginx packaging | `sites-available/pistomp-mobile` | monolithic `nginx.conf` + include snippet | TBD — may keep either layout |
| `~/Pistomp-Mobile` git clone | overlay RAM (may not survive reboot) | persists on ext4 | same quirk as headless |

### pi-stomp firmware (`config.yml` + code)

| Item | In hardware diff? |
|------|-------------------|
| `hardware.version: 3.0` | Yes |
| Footswitch / ADC / ledstrip map | Yes (shared Tre block) |
| Encoder map | **Yes — differs per variant** |
| `audiocard` / IQaudIO | Auto via `audiocardfactory` (same card on both probes) |
| `profile: headless` (stub LCD, skip local UI loop) | **Future** — pi-stomp `hardwarefactory`, not Pistomp-Mobile |

### Pistomp-Mobile (this repo)

| Item | Variant-specific? |
|------|-------------------|
| React `dist/` | **No** — one build |
| `install-pistomp-mobile.sh` | Auto-detect overlay vs writable |
| `pistomp-wifi-api.py` | Dual path: FAT + `~/data` + `/proc/1/root` (vanilla uses writable branch more) |
| `pistomp-audio-api.py` | Uses pi-stomp `audiocardfactory` when `~/pi-stomp` present |

---

## Suggested hardware diff / profile shape (for pi-stomp devs)

```yaml
hardware:
  version: 3.0                    # Tre electrical class — both units
  profile: full_pcb | headless    # NEW (proposed) — encoder preset + LCD policy
  midi:
    channel: 14
  footswitches: ...               # shared Tre ADC block (same on probed units)
  encoders: ...                   # variant-specific (see above)
```

**`profile: headless`** (firmware, not YAML-only):

- Optional: no-op or minimal LCD init when no display fitted
- Keep `audiocard` / MOD / MIDI paths unchanged
- Does **not** replace overlayroot or FAT WiFi — still image OS

---

## Probe commands (repeatable)

```bash
# OS / image
findmnt -n -o FSTYPE /
grep '^overlayroot=' /etc/overlayroot.conf 2>/dev/null
ls /etc/nginx/sites-available/pistomp-mobile 2>/dev/null
ls /etc/nginx/pistomp-mobile-8080.conf 2>/dev/null
cat /proc/asound/cards
systemctl is-enabled wifi-hotspot.service 2>/dev/null
test -f /boot/firmware/pistomp-mobile/wifi-mode.json && cat /boot/firmware/pistomp-mobile/wifi-mode.json || echo "no FAT wifi pref"

# pi-stomp hardware (no PyYAML required)
sed -n '/^hardware:/,/^[^ ]/p' /home/pistomp/data/config/default_config.yml | head -80
git -C ~/pi-stomp rev-parse --short HEAD
```

---

## Pistomp-Mobile install (unchanged recommendation)

```bash
git clone https://github.com/rosenauproductions/Pistomp-Mobile.git ~/Pistomp-Mobile
cd ~/Pistomp-Mobile
bash scripts/install-pistomp-mobile.sh --reboot   # --reboot when overlayroot
```

See [DEPLOYMENT.md](../DEPLOYMENT.md) and [PI-STOMP-VARIANTS.md](./PI-STOMP-VARIANTS.md).

---

## References

- Tre template upstream: `setup/config_templates/default_config_pistomptre.yml` in [TreeFallSound/pi-stomp](https://github.com/TreeFallSound/pi-stomp)
- `hardwarefactory.py` selects class by `hardware.version` only (no `profile` yet)
- Pistomp-Mobile v1.2.0 verified on **both** probed units
