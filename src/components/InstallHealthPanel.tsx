import { useCallback, useState } from "react";
import { runInstallHealthCheck, type HealthCheckRow } from "../lib/installHealth";

export function InstallHealthPanel() {
  const [rows, setRows] = useState<HealthCheckRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      setRows(await runInstallHealthCheck());
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="install-health">
      <button type="button" className="btn-ghost" disabled={busy} onClick={() => void run()}>
        {busy ? "Checking…" : "Run system check"}
      </button>
      {rows && (
        <ul className="install-health-list">
          {rows.map((r) => (
            <li key={r.name} className={r.ok ? "ok" : "fail"}>
              <span className="install-health-mark">{r.ok ? "✓" : "✕"}</span>
              <span className="install-health-name">{r.name}</span>
              <span className="install-health-detail">{r.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
