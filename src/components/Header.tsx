import type { ConnectionMode } from "../api/types";

interface Props {
  title: string;
  mode: ConnectionMode;
  connectionBroken: boolean;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onSettings: () => void;
  onPedalboards: () => void;
  onReconnect: () => void;
}

export function Header({
  title,
  mode,
  connectionBroken,
  dirty,
  saving,
  onSave,
  onSettings,
  onPedalboards,
  onReconnect,
}: Props) {
  return (
    <header className="header">
      <button type="button" className="icon-btn" onClick={onPedalboards} aria-label="Pedalboards">
        ☰
      </button>
      <div className="header-main">
        <h1>{title}</h1>
        <div className="sub">PiStomp-Mobile</div>
      </div>
      {dirty && (
        <button
          type="button"
          className="save-btn"
          onClick={onSave}
          disabled={saving}
          aria-label="Save pedalboard"
        >
          {saving ? "…" : "Save"}
        </button>
      )}
      {connectionBroken ? (
        <div className="header-connection">
          <button
            type="button"
            className="icon-btn reconnect-btn"
            onClick={onReconnect}
            aria-label="Reconnect to Pi-Stomp"
            title="Reconnect"
          >
            ↻
          </button>
          <span className="badge broken" role="status" aria-live="polite" title="No server connection">
            offline
          </span>
        </div>
      ) : (
        <span className={`badge ${mode === "offline" ? "broken" : mode}`}>{mode}</span>
      )}
      <button type="button" className="icon-btn" onClick={onSettings} aria-label="Connection settings">
        ⚙
      </button>
    </header>
  );
}
