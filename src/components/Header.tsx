import type { ConnectionMode } from "../api/types";

interface Props {
  title: string;
  mode: ConnectionMode;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onSettings: () => void;
  onPedalboards: () => void;
}

export function Header({
  title,
  mode,
  dirty,
  saving,
  onSave,
  onSettings,
  onPedalboards,
}: Props) {
  return (
    <header className="header">
      <button type="button" className="icon-btn" onClick={onPedalboards} aria-label="Pedalboards">
        ☰
      </button>
      <div className="header-main">
        <h1>{title}</h1>
        <div className="sub">Pi-Stomp Mobile</div>
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
      <span className={`badge ${mode}`}>{mode}</span>
      <button type="button" className="icon-btn" onClick={onSettings} aria-label="Connection settings">
        ⚙
      </button>
    </header>
  );
}
