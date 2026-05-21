# MOD Desktop vs Pi-Stomp runtime

Pistomp-Mobile ships on the **Pi-Stomp device** (nginx `:8080` → MOD-UI `:80`). Local **MOD Desktop** + emulator is a separate dev target.

Use **Settings → Runtime** (dev only) to switch modes. Production installs on the Pi always use **Pi-Stomp** behavior.

## Pi-Stomp (device) — ship this

| Topic | Behavior |
|--------|----------|
| API | Same origin `:8080`; Host field **empty** |
| Current pedalboard | `GET /pedalboard/current` when available |
| Bypass / parameters | **WebSocket `param_set` first** (stock MOD-UI, same as [pi-stomp PR #25](https://github.com/sastraxi/pi-stomp/pull/25)); fallback `POST …/pi_stomp_set/…` (pi-stomp patch). WS for inbound sync too |
| Bypass in `/pedalboard/info/` | Treated as live enough for refresh |
| `last.json` | **Not used** |
| Direct `ws://127.0.0.1:18181` | **Not used** |
| **Hardware input gain (ALSA)** | Pi-Stomp LCD system menu → `audiocard` `CAPTURE_VOLUME` (~−19.75…+12 dB). **Not in MOD-UI.** Mobile does not expose this yet (see below). |

### Hardware audio vs “Quick controls” on mobile

On the **device**, “Input Gain” in the pi-stomp system menu adjusts the **ALSA capture level** (codec / `alsactl` state), not a MOD effect parameter. VU meters are recalibrated when that value changes.

**Pistomp-Mobile today:**

- **Quick controls → Gain / Master** — optional MOD plugins on the *loaded pedalboard* (via WebSocket `param_set`). If your board has no Gain/Master block, those sliders do not appear. This is **not** the same as hardware input gain.
- **Settings** — ALSA control picker + connection host (leave host **empty** on `:8080` so API/WS stay same-origin).

**MOD Desktop dev** has no equivalent: capture level is the host OS / interface, not something MOD-UI exposes over `/effect/*`.

**To add Pi input gain in mobile** (future, Pi-only):

1. Small HTTP API on pi-stomp (read/write `audiocard.get_volume_parameter` / `set_volume_parameter` for `CAPTURE_VOLUME`, optionally headphone `MASTER`).
2. nginx on `:8080` proxy e.g. `/pistomp/audio/*` → that service (same pattern as MOD paths).
3. UI: slider in Settings (or top of main screen), gated with `isPiStompMode()` — hidden or disabled under MOD Desktop runtime.

Do not route hardware input gain through MOD WebSocket; it is outside the pedalboard graph.

## MOD Desktop (local dev) — do not ship

| Topic | Behavior |
|--------|----------|
| API | Dev proxy to `http://127.0.0.1:18181` (`./run_mobile.sh` or `npm run dev`) |
| Current pedalboard | `/pedalboard/current` is **404**; use `~/Documents/MOD Desktop/last.json` via `/mod-last.json` |
| Bypass / parameters | **WebSocket only** — HTTP set returns `true` but FakeHMI does nothing |
| WebSocket `param_set` | Out: `param_set /graph/{instance}/{port} {value}` — In: `param_set /graph/{instance} {port} {value}` |
| WebSocket protocol | Must echo `ping` → `pong` and `data_ready …` → same line (MOD-UI stalls otherwise) |
| `/pedalboard/info/` | **Stale** (disk); poll must not overwrite live bypass/values — merge from UI + WS |
| WebSocket | `ws://localhost:5173/websocket` (Vite proxy; MOD rejects `Origin: :5173` — proxy rewrites to `http://127.0.0.1:18181`) |
| Snapshots | `snapshot/name?id=current` often **500** on Desktop |

## Dev commands

```bash
# MOD Desktop + emulator (default local QA)
npm run dev
# or: cd ~/pi-stomp && ./run_mobile.sh

# Pi-Stomp MOD-UI on :80 (SSH tunnel or local mod-ui)
npm run dev:pistomp
```

After changing runtime in Settings, use **Save & reconnect**. If you switch Pi-Stomp mode but the dev server still proxies to `:18181`, restart with `npm run dev:pistomp`.

## Rule for changes

- **Pi-Stomp path** = default in production, minimal surprises on hardware.
- **MOD Desktop path** = gated by `isModDesktopMode()` / `isPiStompMode()` in `src/lib/runtimeMode.ts` and `src/api/modui.ts`.
- Do not add Desktop-only hacks (e.g. `last.json`, direct `:18181` WS) without a runtime check.
