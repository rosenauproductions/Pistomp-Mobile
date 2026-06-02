import { useCallback, useEffect, useState } from "react";
import type { WifiStatus } from "../api/pistompWifi";
import * as pistompWifi from "../api/pistompWifi";
import { WifiConfigureSection } from "./WifiConfigureSection";

interface Props {
  available: boolean;
  onRefresh: () => Promise<WifiStatus | null>;
}

export function WifiAdminControls({ available, onRefresh }: Props) {
  const [status, setStatus] = useState<WifiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMode, setConfirmMode] = useState<"hotspot" | "router" | null>(null);

  const load = useCallback(async () => {
    const s = await onRefresh();
    setStatus(s);
    return s;
  }, [onRefresh]);

  useEffect(() => {
    if (available) void load();
  }, [available, load]);

  const applyMode = async (mode: "hotspot" | "router") => {
    setConfirmMode(null);
    setBusy(true);
    setError(null);
    const result = await pistompWifi.setWifiMode(mode);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not change WiFi mode");
      return;
    }
    if (result.status) setStatus(result.status);
    window.setTimeout(() => void load(), 5000);
  };

  const modeLabel =
    status?.mode === "hotspot"
      ? "Hotspot"
      : status?.mode === "router"
        ? "Router"
        : "Unknown";

  const isHotspot = status?.mode === "hotspot";
  const isRouter = status?.mode === "router";

  return (
    <div className="wifi-admin">
      {!available ? (
        <p className="runtime-mode-hint">
          WiFi admin API not reachable — re-run <code>install-on-pistomp.sh</code> on the Pi
          (includes <code>/pistomp/wifi/</code>).
        </p>
      ) : (
        <>
          <p className="wifi-admin-status">
            Current mode: <strong>{modeLabel}</strong>
            {status?.ipAddress ? (
              <>
                {" "}
                · IP <code>{status.ipAddress}</code>
              </>
            ) : null}
            {status?.ssid && status.mode !== "hotspot" ? (
              <>
                {" "}
                · <span>{status.ssid}</span>
              </>
            ) : null}
          </p>
          {confirmMode === "router" && (
            <div className="wifi-admin-warning" role="alert">
              <strong>Switch to router Wi‑Fi?</strong> This phone will disconnect from the Pi.
              Rejoin your home Wi‑Fi, then open <code>http://pistomp.local:8080</code>.
              <div className="wifi-admin-actions">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => void applyMode("router")}
                >
                  Confirm router mode
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => setConfirmMode(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {confirmMode === "hotspot" && (
            <div className="wifi-admin-warning" role="alert">
              <strong>Switch to hotspot?</strong> Join Wi‑Fi{" "}
              <code>{status?.hotspotSsid ?? "pistomp"}</code> (password{" "}
              <code>{status?.hotspotPassword ?? "pistompwifi"}</code>), then reopen this app at{" "}
              <code>http://pistomp.local:8080</code> or <code>http://172.24.1.1:8080</code>.
              <div className="wifi-admin-actions">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => void applyMode("hotspot")}
                >
                  Confirm hotspot mode
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => setConfirmMode(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!confirmMode && (
            <>
              <div className="wifi-mode-buttons" role="group" aria-label="WiFi mode">
                <button
                  type="button"
                  className={`wifi-mode-btn hotspot ${isHotspot ? "active" : ""}`}
                  disabled={busy || isHotspot}
                  onClick={() => setConfirmMode("hotspot")}
                >
                  <span className="wifi-mode-btn-title">Use hotspot</span>
                  <span className="wifi-mode-btn-sub">
                    SSID {status?.hotspotSsid ?? "pistomp"} · portable
                  </span>
                </button>
                <button
                  type="button"
                  className={`wifi-mode-btn router ${isRouter ? "active" : ""}`}
                  disabled={busy || isRouter}
                  onClick={() => setConfirmMode("router")}
                >
                  <span className="wifi-mode-btn-title">Use router</span>
                  <span className="wifi-mode-btn-sub">Home Wi‑Fi · internet</span>
                </button>
              </div>
              <button
                type="button"
                className="btn-ghost wifi-refresh-link"
                disabled={busy}
                onClick={() => void load()}
              >
                Refresh WiFi status
              </button>

              <WifiConfigureSection
                status={status}
                busy={busy}
                onBusyChange={setBusy}
                onStatus={(s) => setStatus(s)}
                onError={setError}
              />
            </>
          )}

          {busy && (
            <p className="runtime-mode-hint">Working on WiFi — this can take up to a minute…</p>
          )}
          {error && (
            <p className="wifi-admin-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
