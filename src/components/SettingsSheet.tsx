import { useCallback, useEffect, useState } from "react";
import type { ConnectionMode } from "../api/types";
import type { HardwareInputState } from "../api/pistompAudio";
import type { WifiStatus } from "../api/pistompWifi";
import { WifiAdminControls } from "./WifiAdminControls";
import { getAppVersionLabel } from "../lib/appVersion";
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
  onRefreshWifi: () => Promise<WifiStatus | null>;
  onClose: () => void;
  onSave: (host: string) => void;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  onHardwareControlChange: (controlName: string) => void;
  showHardwareInput: boolean;
  onShowHardwareInputChange: (visible: boolean) => void;
  onTest: () => void;
  onCollectQa: () => Promise<string>;
}

export function SettingsSheet({
  open,
  host,
  mode,
  runtimeMode,
  hardwareInput,
  wifiAdminAvailable,
  onRefreshWifi,
  onClose,
  onSave,
  onRuntimeModeChange,
  onHardwareControlChange,
  showHardwareInput,
  onShowHardwareInputChange,
  onTest,
  onCollectQa,
}: Props) {
  const [value, setValue] = useState(host);
  const [runtime, setRuntime] = useState(runtimeMode);
  const [alsaControl, setAlsaControl] = useState(hardwareInput?.control ?? "");
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
      void refreshQa();
    }
  }, [open, host, runtimeMode, hardwareInput?.control, refreshQa]);

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

        {showHardware && (
          <div className="runtime-mode-block admin-block">
            <span className="admin-section-title">Admin</span>

            <div className="admin-subsection">
              <span className="admin-subsection-label">WiFi</span>
              <WifiAdminControls available={wifiAdminAvailable} onRefresh={onRefreshWifi} />
            </div>

            <div className="admin-subsection">
              <span className="admin-subsection-label">Input controls</span>
              <label className="admin-toggle-row">
                <input
                  type="checkbox"
                  checked={showHardwareInput}
                  onChange={(e) => onShowHardwareInputChange(e.target.checked)}
                />
                <span>Show input gain slider on main screen</span>
              </label>
              <p className="runtime-mode-hint">
                When off, input gain is only in Admin below (ALSA picker).
              </p>
            </div>

            <div className="admin-subsection">
              <span className="admin-subsection-label">Hardware audio (ALSA)</span>
              {hardwareInput ? (
                <>
                  <label>
                    <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Input gain control</span>
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
                  <p className="runtime-mode-hint">
                    Same ALSA control as the Pi-Stomp system menu (e.g. Aux). Requires{" "}
                    <code>install-on-pistomp.sh</code>.
                  </p>
                </>
              ) : (
                <p className="runtime-mode-hint">
                  {mode === "live"
                    ? "Hardware ALSA API not reachable — re-run install-on-pistomp.sh on the Pi."
                    : "Connect to the Pi to configure hardware input volume."}
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
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            if (showRuntime && runtime !== runtimeMode) {
              onRuntimeModeChange(runtime);
            }
            onSave(value);
            onClose();
          }}
        >
          Save & reconnect
        </button>
        <button type="button" className="btn-ghost" onClick={onTest}>
          Test connection ({mode})
        </button>
        {showRuntime && runtime === "modDesktop" && (
          <p className="runtime-mode-hint">
            Keep MOD Desktop running. WebSocket opens on first stomp (not at page load).
          </p>
        )}

        <div className="qa-block">
          <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
            QA report (paste to support / agent)
          </span>
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
            <button type="button" className="btn-ghost" onClick={() => void refreshQa()} disabled={qaBusy}>
              {qaBusy ? "Refreshing…" : "Refresh QA"}
            </button>
            <button type="button" className="btn-primary" onClick={() => void copyQa()} disabled={!qaText || qaBusy}>
              {qaCopied ? "Copied" : "Copy QA"}
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
