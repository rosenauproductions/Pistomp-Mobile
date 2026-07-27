import { useEffect, useState } from "react";
import { EffectGrid } from "./components/EffectGrid";
import { EffectSettingsSheet } from "./components/EffectSettingsSheet";
import { GlobalControls } from "./components/GlobalControls";
import { Header } from "./components/Header";
import { PedalboardSheet } from "./components/PedalboardSheet";
import { SettingsSheet } from "./components/SettingsSheet";
import { SnapshotBar, snapshotCount } from "./components/SnapshotBar";
import { ConnectionStatusBar } from "./components/ConnectionStatusBar";
import { useStomp } from "./hooks/useStomp";
import type { EffectPlugin } from "./api/types";
import {
  getDisplayRotation,
  lockDisplayOrientation,
  setDisplayRotation as persistDisplayRotation,
  type DisplayRotation,
} from "./lib/displayRotation";

export default function App() {
  const stomp = useStomp();
  const [pedalboardsOpen, setPedalboardsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [effectSettingsInstance, setEffectSettingsInstance] = useState<string | null>(null);
  const [displayRotation, setDisplayRotationState] = useState<DisplayRotation>(() =>
    getDisplayRotation(),
  );

  const setDisplayRotation = (rotation: DisplayRotation) => {
    persistDisplayRotation(rotation);
    setDisplayRotationState(rotation);
    void lockDisplayOrientation(rotation);
  };

  useEffect(() => {
    void lockDisplayOrientation(displayRotation);
  }, [displayRotation]);

  const openEffectSettings = (plugin: EffectPlugin) => {
    setEffectSettingsInstance(plugin.instance);
  };

  const effectPlugin =
    effectSettingsInstance != null ? stomp.getPlugin(effectSettingsInstance) ?? null : null;

  const pedalRotation = displayRotation === "portrait" ? undefined : displayRotation;

  return (
    <div className="app-shell" data-pedal-rotation={pedalRotation}>
      <div className={`app ${stomp.busy ? "busy-overlay" : ""}`} aria-busy={stomp.busy}>
        <Header
          title={stomp.board.title}
          mode={stomp.mode}
          connectionBroken={stomp.connectionBroken}
          dirty={stomp.dirty}
          saving={stomp.busy}
          onSave={() => void stomp.saveChanges()}
          onPedalboards={() => setPedalboardsOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onReconnect={() => void stomp.connect()}
        />

        {stomp.busy && stomp.busyMessage && (
          <div className="busy-banner" role="status">
            {stomp.busyMessage}
          </div>
        )}

        <ConnectionStatusBar line={stomp.connectionStatusLine} broken={stomp.connectionBroken} />

        <main className="main">
          {stomp.mode === "offline" && (
            <div className="board-warning" role="alert">
              <strong>Not connected to MOD.</strong> Tap <em>↻</em> in the header or fix the network
              URL in Settings → Advanced.
            </div>
          )}

          {stomp.boardEmptyWarning && (
            <div className="board-warning" role="alert">
              <strong>Empty pedalboard.</strong> MOD returned no effects for this board. Use{" "}
              <em>Change pedalboard</em> to pick it again, or reload the page. Opening Settings no
              longer wipes the Pi graph (fixed in 0.2.6).
            </div>
          )}

          {stomp.dirty && stomp.mode === "demo" && (
            <p className="demo-save-hint">Demo mode — Save clears the unsaved indicator only.</p>
          )}

          <button type="button" className="pedalboard-picker" onClick={() => setPedalboardsOpen(true)}>
            Change pedalboard
          </button>

          <h2 className="section-title">
            Snapshots
            {snapshotCount(stomp.snapshots) > 0 ? ` (${snapshotCount(stomp.snapshots)})` : ""}
          </h2>
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
          runtimeMode={stomp.runtimeMode}
          hardwareInput={stomp.hardwareInput}
          wifiAdminAvailable={stomp.wifiAdminAvailable}
          displayRotation={displayRotation}
          onDisplayRotationChange={setDisplayRotation}
          onRefreshWifi={stomp.refreshWifiStatus}
          onClose={() => setSettingsOpen(false)}
          onSave={stomp.saveHost}
          onRuntimeModeChange={stomp.saveRuntimeMode}
          onHardwareControlChange={(name) => void stomp.setHardwareInputControl(name)}
          onHardwareInputChange={(v) => void stomp.setHardwareInputValue(v)}
          onRefreshHardwareInput={async () => {
            await stomp.refreshHardwareInput();
          }}
          onReloadPedalboard={stomp.reloadActivePedalboard}
          onTest={() => void stomp.connect()}
          onCollectQa={stomp.collectQa}
          wifiStatus={stomp.wifiStatus}
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
    </div>
  );
}
