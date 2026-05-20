import { useEffect, useState } from "react";
import type { ConnectionMode } from "../api/types";
import {
  isRuntimeModeToggleVisible,
  type RuntimeMode,
} from "../lib/runtimeMode";
import { Sheet } from "./Sheet";

interface Props {
  open: boolean;
  host: string;
  mode: ConnectionMode;
  runtimeMode: RuntimeMode;
  onClose: () => void;
  onSave: (host: string) => void;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  onTest: () => void;
}

export function SettingsSheet({
  open,
  host,
  mode,
  runtimeMode,
  onClose,
  onSave,
  onRuntimeModeChange,
  onTest,
}: Props) {
  const [value, setValue] = useState(host);
  const [runtime, setRuntime] = useState(runtimeMode);
  const showRuntime = isRuntimeModeToggleVisible();

  useEffect(() => {
    if (open) {
      setValue(host);
      setRuntime(runtimeMode);
    }
  }, [open, host, runtimeMode]);

  return (
    <Sheet title="Connection" open={open} onClose={onClose}>
      <div className="settings-form">
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

        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
          Leave blank for same-origin (Pi install on :8080). Hotspot:{" "}
          <code>http://172.24.1.1:8080</code>
        </p>
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
      </div>
    </Sheet>
  );
}
