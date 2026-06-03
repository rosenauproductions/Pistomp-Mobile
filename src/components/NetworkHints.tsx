import type { WifiStatus } from "../api/pistompWifi";

interface Props {
  status: WifiStatus | null;
}

function deviceUrl(ip: string): string {
  return `http://${ip}:8080`;
}

export function NetworkHints({ status }: Props) {
  const ip = status?.ipAddress?.trim();
  const hotspotIp = "172.24.1.1";

  return (
    <div className="network-hints">
      <span className="admin-subsection-label">Open on this phone</span>
      <p className="runtime-mode-hint">
        Same Wi‑Fi as the Pi, then try one of these URLs:
      </p>
      <ul className="network-hints-list">
        <li>
          <a href="http://pistomp.local:8080/">http://pistomp.local:8080</a>
        </li>
        {ip && ip !== hotspotIp ? (
          <li>
            <a href={deviceUrl(ip)}>{deviceUrl(ip)}</a>
            <span className="network-hints-tag">router / home LAN</span>
          </li>
        ) : null}
        <li>
          <a href={`http://${hotspotIp}:8080/`}>{deviceUrl(hotspotIp)}</a>
          <span className="network-hints-tag">hotspot</span>
        </li>
      </ul>
    </div>
  );
}
