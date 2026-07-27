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
import {
  isOnPiStompDevice,
  isRuntimeModeToggleVisible,
  type RuntimeMode,
} from "../lib/runtimeMode";
import { Sheet } from "./Sheet";

interface Props {
  open: boolean;
  host: string;
  mode: ConnectionMode;
  runtimeMode: RuntimeMode;
  hardwareInput: HardwareInputState | null;
  wifiAdminAvailable: boolean;
  displayRotation: DisplayRotation;
  onDisplayRotationChange: (rotation: DisplayRotation) => void;
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
    if (open) {
      setValue(host);
      setRuntime(runtimeMode);
      setAlsaControl(hardwareInput?.control ?? "");
      if (mode === "live") void onRefreshHardwareInput();
    }
  }, [open, host, runtimeMode, hardwareInput?.control, mode, onRefreshHardwareInput]);

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

  return (
    <Sheet title="Settings" open={open} onClose={onClose}>
      <div className="settings-form">
        <p className="settings-version">
          Version <strong>{getAppVersionLabel()}</strong>
        </p>

        <div className="runtime-mode-block">
          <span className="admin-subsection-label">Display</span>
          <div className="display-rotation-toggle" role="group" aria-label="Display rotation">
            {(
              [
                { id: "portrait", label: "Portrait" },
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
            Rotates pedals and snapshots in place (chrome stays put). Locks portrait orientation
            when possible (best in Add to Home Screen). No reconnect needed.
          </p>
        </div>

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
                  <p className="runtime-mode-hint">
                    Tap a stomp or slider first, then Refresh — the log captures what the app tried.
                    Probes are read-only (they do not call <code>/reset/</code>, which would delete all
                    effects on the Pi).
                  </p>
                  <textarea
                    className="qa-textarea"
                    readOnly
                    value={qaBusy ? "Running probes…" : qaText}
                    rows={14}
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
