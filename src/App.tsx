import { useState } from "react";
import { EffectGrid } from "./components/EffectGrid";
import { EffectSettingsSheet } from "./components/EffectSettingsSheet";
import { GlobalControls } from "./components/GlobalControls";
import { Header } from "./components/Header";
import { PedalboardSheet } from "./components/PedalboardSheet";
import { SettingsSheet } from "./components/SettingsSheet";
import { SnapshotBar } from "./components/SnapshotBar";
import { useStomp } from "./hooks/useStomp";
import type { EffectPlugin } from "./api/types";

export default function App() {
  const stomp = useStomp();
  const [pedalboardsOpen, setPedalboardsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [effectSettingsInstance, setEffectSettingsInstance] = useState<string | null>(null);

  const openEffectSettings = (plugin: EffectPlugin) => {
    setEffectSettingsInstance(plugin.instance);
  };

  const effectPlugin =
    effectSettingsInstance != null ? stomp.getPlugin(effectSettingsInstance) ?? null : null;

  return (
    <div className={`app ${stomp.busy ? "busy-overlay" : ""}`}>
      <Header
        title={stomp.board.title}
        mode={stomp.mode}
        dirty={stomp.dirty}
        saving={stomp.busy}
        onSave={() => void stomp.saveChanges()}
        onPedalboards={() => setPedalboardsOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />

      <main className="main">
        {stomp.dirty && stomp.mode === "demo" && (
          <p className="demo-save-hint">Demo mode — Save clears the unsaved indicator only.</p>
        )}

        <button type="button" className="pedalboard-picker" onClick={() => setPedalboardsOpen(true)}>
          Change pedalboard
        </button>

        <h2 className="section-title">Snapshots</h2>
        <SnapshotBar
          snapshots={stomp.snapshots}
          activeId={stomp.activeSnapshot}
          onSelect={(id) => void stomp.loadSnapshot(id)}
        />

        <GlobalControls controls={stomp.globals} onChange={(c, v) => void stomp.setGlobalValue(c, v)} />

        <div className="strip">
          <span>Effects</span>
          <span>
            <strong>{stomp.activeCount}</strong> active
          </span>
        </div>

        <EffectGrid
          plugins={stomp.board.plugins}
          onToggle={(p) => void stomp.toggleBypass(p)}
          onOpenSettings={openEffectSettings}
        />
      </main>

      <PedalboardSheet
        open={pedalboardsOpen}
        pedalboards={stomp.pedalboards}
        activeBundle={stomp.activeBundle}
        onClose={() => setPedalboardsOpen(false)}
        onSelect={(pb) => void stomp.selectPedalboard(pb)}
      />

      <SettingsSheet
        open={settingsOpen}
        host={stomp.host}
        mode={stomp.mode}
        onClose={() => setSettingsOpen(false)}
        onSave={stomp.saveHost}
        onTest={() => void stomp.connect()}
      />

      <EffectSettingsSheet
        plugin={effectPlugin}
        open={effectSettingsInstance != null}
        onClose={() => setEffectSettingsInstance(null)}
        onChange={(inst, port, val) => void stomp.setEffectParameter(inst, port, val)}
      />

      {stomp.error && (
        <div className="toast" role="alert">
          {stomp.error}
          <button
            type="button"
            style={{
              marginLeft: "0.75rem",
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
            }}
            onClick={stomp.clearError}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
