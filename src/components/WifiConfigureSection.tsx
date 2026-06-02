import { useEffect, useState } from "react";
import type { WifiStatus } from "../api/pistompWifi";
import * as pistompWifi from "../api/pistompWifi";

interface Props {
  status: WifiStatus | null;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onStatus: (status: WifiStatus) => void;
  onError: (message: string | null) => void;
}

export function WifiConfigureSection({ status, busy, onBusyChange, onStatus, onError }: Props) {
  const [hotspotSsid, setHotspotSsid] = useState("pistomp");
  const [hotspotPassword, setHotspotPassword] = useState("pistompwifi");
  const [routerSsid, setRouterSsid] = useState("");
  const [routerPassword, setRouterPassword] = useState("");
  const [confirmRouter, setConfirmRouter] = useState(false);

  useEffect(() => {
    if (!status) return;
    setHotspotSsid(status.hotspotSsid || "pistomp");
    setHotspotPassword(status.hotspotPassword || "pistompwifi");
    if (status.mode === "router" && status.ssid) {
      setRouterSsid(status.ssid);
    }
  }, [status]);

  const saveHotspot = async () => {
    onError(null);
    onBusyChange(true);
    const result = await pistompWifi.configureWifi("hotspot", hotspotSsid, hotspotPassword);
    onBusyChange(false);
    if (!result.ok) {
      onError(result.error ?? "Could not save hotspot settings");
      return;
    }
    if (result.status) onStatus(result.status);
  };

  const saveRouter = async () => {
    setConfirmRouter(false);
    onError(null);
    onBusyChange(true);
    const result = await pistompWifi.configureWifi("router", routerSsid, routerPassword);
    onBusyChange(false);
    if (!result.ok) {
      onError(result.error ?? "Could not connect to router");
      return;
    }
    if (result.status) onStatus(result.status);
  };

  return (
    <div className="wifi-configure">
      <span className="admin-subsection-label">Configure WiFi</span>

      <div className="wifi-config-block">
        <p className="wifi-config-heading">Hotspot (Pi broadcasts)</p>
        <label>
          <span className="field-label">Hotspot name (SSID)</span>
          <input
            value={hotspotSsid}
            onChange={(e) => setHotspotSsid(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={32}
            disabled={busy}
          />
        </label>
        <label>
          <span className="field-label">Hotspot password</span>
          <input
            type="password"
            value={hotspotPassword}
            onChange={(e) => setHotspotPassword(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            minLength={8}
            disabled={busy}
          />
        </label>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void saveHotspot()}>
          Save hotspot name & password
        </button>
        <p className="runtime-mode-hint">
          Takes effect on the Pi hotspot profile. Use <strong>Use hotspot</strong> above to turn it on.
        </p>
      </div>

      <div className="wifi-config-block">
        <p className="wifi-config-heading">Home router (Pi joins your Wi‑Fi)</p>
        {status?.savedNetworks && status.savedNetworks.length > 0 && (
          <label>
            <span className="field-label">Saved on Pi</span>
            <select
              value={routerSsid}
              onChange={(e) => setRouterSsid(e.target.value)}
              disabled={busy}
            >
              <option value="">— pick or type below —</option>
              {status.savedNetworks.map((n) => (
                <option key={n.name} value={n.ssid}>
                  {n.ssid}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className="field-label">Router name (SSID)</span>
          <input
            value={routerSsid}
            onChange={(e) => setRouterSsid(e.target.value)}
            placeholder="Your home Wi‑Fi name"
            autoCapitalize="none"
            autoCorrect="off"
            disabled={busy}
          />
        </label>
        <label>
          <span className="field-label">Router password</span>
          <input
            type="password"
            value={routerPassword}
            onChange={(e) => setRouterPassword(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            disabled={busy}
          />
        </label>

        {confirmRouter ? (
          <div className="wifi-admin-warning" role="alert">
            <strong>Connect to this router?</strong> Your phone will leave the Pi hotspot. Reopen
            this app at <code>http://pistomp.local:8080</code> on the same network as the Pi.
            <div className="wifi-admin-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => void saveRouter()}
              >
                Connect now
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={() => setConfirmRouter(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !routerSsid.trim()}
            onClick={() => setConfirmRouter(true)}
          >
            Save & connect to router
          </button>
        )}
        <p className="runtime-mode-hint">WPA2 networks with a password are supported.</p>
      </div>
    </div>
  );
}
