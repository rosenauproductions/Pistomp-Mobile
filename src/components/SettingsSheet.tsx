import { useCallback, useEffect, useState } from "react";
import type { ConnectionMode } from "../api/types";
import type { HardwareInputState } from "../api/pistompAudio";
import type { WifiStatus } from "../api/pistompWifi";
import { HardwareInputControls } from "./HardwareInputControls";
import { InstallHealthPanel } from "./InstallHealthPanel";
import { NetworkHints } from "./NetworkHints";
import { WifiAdminControls } from "./WifiAdminControls";
import { getAppVersionLabel } from "../lib/appVersion";
import type { DisplayRotation } from "../lib/displayRotation";
import type { VuMode, VuStyle } from "../lib/vuPrefs";
import {
  isOnPiStompDevice,
  isRuntimeModeToggleVisible,
  type RuntimeMode,
} from "../lib/runtimeMode";
import { requestPiShutdown } from "../api/pistompWifi";
import { Sheet } from "./Sheet";

type ShutdownPhase = "idle" | "confirm" | "shutting-down" | "safe";

interface Props {
  open: boolean;
  host: string;
  mode: ConnectionMode;
  runtimeMode: RuntimeMode;
  hardwareInput: HardwareInputState | null;
  wifiAdminAvailable: boolean;
  displayRotation: DisplayRotation;
  onDisplayRotationChange: (rotation: DisplayRotation) => void;
  hideUnassignedMidi: boolean;
  onHideUnassignedMidiChange: (hide: boolean) => void;
  showVu: boolean;
  onShowVuChange: (show: boolean) => void;
  vuStyle: VuStyle;
  onVuStyleChange: (style: VuStyle) => void;
  vuMode: VuMode;
  onVuModeChange: (mode: VuMode) => void;
  onRefreshWifi: () => Promise<WifiStatus | null>;
  onClose: () => void;
  onSave: (host: string) => void;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  onHardwareControlChange: (controlName: string) => void;
  onHardwareInputChange: (value: number) => void;
  onRefreshHardwareInput: () => Promise<void>;
  onReloadPedalboard: () => Promise<void>;
  onTest: () => void;
  onCollectQa: () => Promise<string>;
  wifiStatus: WifiStatus | null;
}

export function SettingsSheet({
  open,
  host,
  mode,
  runtimeMode,
  hardwareInput,
  wifiAdminAvailable,
  displayRotation,
  onDisplayRotationChange,
  hideUnassignedMidi,
  onHideUnassignedMidiChange,
  showVu,
  onShowVuChange,
  vuStyle,
  onVuStyleChange,
  vuMode,
  onVuModeChange,
  onRefreshWifi,
  onClose,
  onSave,
  onRuntimeModeChange,
  onHardwareControlChange,
  onHardwareInputChange,
  onRefreshHardwareInput,
  onReloadPedalboard,
  onTest,
  onCollectQa,
  wifiStatus,
}: Props) {
  const [value, setValue] = useState(host);
  const [runtime, setRuntime] = useState(runtimeMode);
  const [alsaControl, setAlsaControl] = useState(hardwareInput?.control ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [qaOpen, setQaOpen] = useState(false);
  const onDevice = isOnPiStompDevice();
  const [qaText, setQaText] = useState("");
  const [qaBusy, setQaBusy] = useState(false);
  const [qaCopied, setQaCopied] = useState(false);
  const [shutdownPhase, setShutdownPhase] = useState<ShutdownPhase>("idle");
  const [shutdownError, setShutdownError] = useState<string | null>(null);
  const showRuntime = isRuntimeModeToggleVisible();
  const showHardware = isOnPiStompDevice() || runtimeMode === "pistomp";

  const refreshQa = useCallback(async () => {
    setQaBusy(true);
    setQaCopied(false);
    try {
      setQaText(await onCollectQa());
    } catch (e) {
      setQaText(`QA collection failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setQaBusy(false);
    }
  }, [onCollectQa]);

  useEffect(() => {
    if (!open) return;
    setValue(host);
    setRuntime(runtimeMode);
    setAlsaControl(hardwareInput?.control ?? "");
    if (mode === "live") void onRefreshHardwareInput();
  }, [open, host, runtimeMode, hardwareInput?.control, mode, onRefreshHardwareInput]);

  // Always reset when opening Settings so a prior "Safe to power off" does not stick
  // after the Pi reboots / the page is refreshed and Settings is opened again.
  useEffect(() => {
    if (!open) return;
    setShutdownPhase("idle");
    setShutdownError(null);
  }, [open]);

  const onShutdown = async () => {
    if (shutdownPhase === "safe" || shutdownPhase === "shutting-down") return;
    if (shutdownPhase !== "confirm") {
      setShutdownPhase("confirm");
      setShutdownError(null);
      return;
    }
    setShutdownPhase("shutting-down");
    setShutdownError(null);
    const result = await requestPiShutdown();
    if (!result.ok) {
      setShutdownPhase("idle");
      setShutdownError(result.error ?? "Shutdown failed");
      return;
    }
    // API accepted the poweroff — trust it (LCD already shows shutdown). Don't wait for network drop.
    setShutdownPhase("safe");
  };

  useEffect(() => {
    if (open && qaOpen) void refreshQa();
  }, [open, qaOpen, refreshQa]);

  const copyQa = async () => {
    try {
      await navigator.clipboard.writeText(qaText);
      setQaCopied(true);
      window.setTimeout(() => setQaCopied(false), 2000);
    } catch {
      /* fallback: select the textarea */
    }
  };

  const shutdownLabel =
    shutdownPhase === "safe"
      ? "Safe to power off"
      : shutdownPhase === "shutting-down"
        ? "Shutting down…"
        : shutdownPhase === "confirm"
          ? "Tap again to confirm shutdown"
          : "Shutdown Pi-Stomp";

  return (
    <Sheet title="Settings" open={open} onClose={onClose}>
      <div className="settings-form">
        <p className="settings-version">
          Version <strong>{getAppVersionLabel()}</strong>
        </p>

        <div className="runtime-mode-block">
          <span className="admin-subsection-label">Display</span>
          <div className="display-rotation-toggle" role="group" aria-label="Display mode">
            {(
              [
                { id: "portrait", label: "Portrait" },
                { id: "landscape", label: "Landscape" },
                { id: "90", label: "90°" },
                { id: "-90", label: "−90°" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`runtime-mode-btn ${displayRotation === opt.id ? "active" : ""}`}
                aria-pressed={displayRotation === opt.id}
                onClick={() => onDisplayRotationChange(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="runtime-mode-hint">
            Portrait: normal layout. Landscape: wide layout, no CSS rotate. 90° / −90°: pedals spin
            in their slots only.
          </p>
        </div>

        <div className="runtime-mode-block">
          <span className="admin-subsection-label">Meters</span>
          <label className="admin-toggle-row">
            <input
              type="checkbox"
              checked={showVu}
              onChange={(e) => onShowVuChange(e.target.checked)}
            />
            <span>Show VU meters on main screen</span>
          </label>
          {showVu && (
            <>
              <div className="display-rotation-toggle" role="group" aria-label="VU style">
                {(
                  [
                    { id: "led" as const, label: "LED" },
                    { id: "needle" as const, label: "Needle" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`runtime-mode-btn ${vuStyle === opt.id ? "active" : ""}`}
                    aria-pressed={vuStyle === opt.id}
                    onClick={() => onVuStyleChange(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="display-rotation-toggle" role="group" aria-label="VU channels">
                {(
                  [
                    { id: "inputs" as const, label: "Inputs" },
                    { id: "outputs" as const, label: "Outputs" },
                    { id: "sum-in" as const, label: "In 1+2" },
                    { id: "sum-out" as const, label: "Out 1+2" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`runtime-mode-btn ${vuMode === opt.id ? "active" : ""}`}
                    aria-pressed={vuMode === opt.id}
                    onClick={() => onVuModeChange(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="runtime-mode-hint">
                Inputs / Outputs: stereo L+R. In 1+2 / Out 1+2: one summed meter. On the Pi, meters
                tap JACK capture / mod-monitor (live). Elsewhere: demo motion.
              </p>
            </>
          )}
        </div>

        <div className="runtime-mode-block">
          <span className="admin-subsection-label">Effects</span>
          <label className="admin-toggle-row">
            <input
              type="checkbox"
              checked={hideUnassignedMidi}
              onChange={(e) => onHideUnassignedMidiChange(e.target.checked)}
            />
            <span>Hide effects with no MIDI assignment</span>
          </label>
          <p className="runtime-mode-hint">
            When on, only shows effects that have a MIDI controller mapped. Default off.
          </p>
        </div>

        {(showHardware || onDevice) && (
          <div className="runtime-mode-block">
            <span className="admin-subsection-label">System</span>
            <button
              type="button"
              className={`btn-danger ${shutdownPhase === "confirm" ? "btn-danger-confirm" : ""} ${shutdownPhase === "safe" ? "btn-safe-poweroff" : ""}`}
              disabled={shutdownPhase === "shutting-down" || shutdownPhase === "safe"}
              onClick={() => void onShutdown()}
            >
              {shutdownLabel}
            </button>
            <p className="runtime-mode-hint">
              {shutdownPhase === "safe"
                ? "Shutdown started — same as the LCD. Unplug power when the screen is done."
                : shutdownPhase === "shutting-down"
                  ? "Asking the Pi to shut down…"
                  : "Same as the Pi-Stomp LCD menu. Tap twice to confirm."}
            </p>
            {shutdownError && (
              <p className="runtime-mode-hint" style={{ color: "var(--danger)" }}>
                {shutdownError}
              </p>
            )}
          </div>
        )}

        {showHardware && (
          <div className="runtime-mode-block admin-block">
            <span className="admin-section-title">Admin</span>

            <div className="admin-subsection">
              <span className="admin-subsection-label">WiFi</span>
              <WifiAdminControls available={wifiAdminAvailable} onRefresh={onRefreshWifi} />
              <NetworkHints status={wifiStatus} />
            </div>

            <div className="admin-subsection">
              <span className="admin-subsection-label">Hardware audio (ALSA)</span>
              {hardwareInput ? (
                <>
                  <label>
                    <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Control</span>
                    <select
                      value={alsaControl}
                      onChange={(e) => {
                        setAlsaControl(e.target.value);
                        onHardwareControlChange(e.target.value);
                      }}
                    >
                      {hardwareInput.controls.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.label} ({c.name})
                        </option>
                      ))}
                    </select>
                  </label>
                  <HardwareInputControls
                    state={hardwareInput}
                    onChange={onHardwareInputChange}
                  />
                  <p className="runtime-mode-hint">
                    Same path as the Pi-Stomp system menu — saved to{" "}
                    <code>/var/lib/alsa/asound.state</code> via pi-stomp{" "}
                    <code>audiocard</code>.
                  </p>
                </>
              ) : (
                <p className="runtime-mode-hint">
                  {mode === "live"
                    ? "Hardware ALSA API not reachable — re-run install-on-pistomp.sh on the Pi."
                    : "Connect to the Pi to adjust hardware volume."}
                </p>
              )}
            </div>
          </div>
        )}

        {showRuntime && (
          <div className="runtime-mode-block">
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Runtime (dev)</span>
            <div className="runtime-mode-toggle" role="group" aria-label="MOD target">
              <button
                type="button"
                className={`runtime-mode-btn ${runtime === "pistomp" ? "active" : ""}`}
                onClick={() => setRuntime("pistomp")}
              >
                Pi-Stomp
              </button>
              <button
                type="button"
                className={`runtime-mode-btn ${runtime === "modDesktop" ? "active" : ""}`}
                onClick={() => setRuntime("modDesktop")}
              >
                MOD Desktop
              </button>
            </div>
            <p className="runtime-mode-hint">
              {runtime === "modDesktop"
                ? "Local MOD at :18181 — WebSocket bypass, last.json sync. See docs/MOD-DESKTOP-VS-PISTOMP.md."
                : "Device MOD at :80 — same as Pi nginx install. Use npm run dev:pistomp if proxy still points at Desktop."}
            </p>
          </div>
        )}

        {!onDevice && (
          <label>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Host URL</span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="(same origin)"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>
        )}
        {onDevice && (
          <p className="runtime-mode-hint">
            Host URL is automatic on the Pi (<code>:8080</code> same-origin). Use Advanced only if
            support asks you to change it.
          </p>
        )}
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            if (showRuntime && runtime !== runtimeMode) {
              onRuntimeModeChange(runtime);
            }
            onSave(onDevice ? "" : value);
            onClose();
          }}
        >
          {onDevice ? "Reconnect" : "Save & reconnect"}
        </button>
        {!onDevice && (
          <button type="button" className="btn-ghost" onClick={onTest}>
            Test connection ({mode})
          </button>
        )}
        {showRuntime && runtime === "modDesktop" && (
          <p className="runtime-mode-hint">
            Keep MOD Desktop running. WebSocket opens on first stomp (not at page load).
          </p>
        )}

        <div className="qa-block">
          <button
            type="button"
            className="btn-ghost qa-toggle-btn"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((v) => !v)}
          >
            {advancedOpen ? "Hide Advanced" : "Advanced"}
          </button>
          {advancedOpen && (
            <>
              {onDevice && (
                <label>
                  <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Host URL (override)</span>
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="(same origin)"
                    autoCapitalize="off"
                    autoCorrect="off"
                  />
                </label>
              )}
              <InstallHealthPanel />
              {mode === "live" && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void onReloadPedalboard()}
                >
                  Reload current pedalboard into MOD (reset)
                </button>
              )}

              <span className="admin-subsection-label">Diagnostics (QA)</span>
              <p className="runtime-mode-hint">
                Deep report for support: cache/bundle mismatch, shutdown dry-run (safe), units,
                poweroff log, WebSocket, and live probes. Copy and paste the whole report.
              </p>
              <button
                type="button"
                className="btn-ghost qa-toggle-btn"
                aria-expanded={qaOpen}
                onClick={() => setQaOpen((v) => !v)}
              >
                {qaOpen ? "Hide QA report" : "Show QA report"}
              </button>
              {qaOpen && (
                <>
                  <textarea
                    className="qa-textarea"
                    readOnly
                    value={qaBusy ? "Running deep probes…" : qaText}
                    rows={22}
                    aria-label="QA diagnostic report"
                  />
                  <div className="qa-actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => void refreshQa()}
                      disabled={qaBusy}
                    >
                      {qaBusy ? "Refreshing…" : "Refresh QA"}
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => void copyQa()}
                      disabled={!qaText || qaBusy}
                    >
                      {qaCopied ? "Copied" : "Copy QA"}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}
