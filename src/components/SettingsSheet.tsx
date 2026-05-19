import { useEffect, useState } from "react";
import type { ConnectionMode } from "../api/types";
import { Sheet } from "./Sheet";

interface Props {
  open: boolean;
  host: string;
  mode: ConnectionMode;
  onClose: () => void;
  onSave: (host: string) => void;
  onTest: () => void;
}

export function SettingsSheet({ open, host, mode, onClose, onSave, onTest }: Props) {
  const [value, setValue] = useState(host);

  useEffect(() => {
    if (open) setValue(host);
  }, [open, host]);

  return (
    <Sheet title="Connection" open={open} onClose={onClose}>
      <div className="settings-form">
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
            onSave(value);
            onClose();
          }}
        >
          Save & reconnect
        </button>
        <button type="button" className="btn-ghost" onClick={onTest}>
          Test connection ({mode})
        </button>
      </div>
    </Sheet>
  );
}
