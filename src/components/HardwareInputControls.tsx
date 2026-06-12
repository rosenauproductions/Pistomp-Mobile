import type { HardwareInputState } from "../api/pistompAudio";

interface Props {
  state: HardwareInputState;
  onChange: (value: number) => void;
}

export function HardwareInputControls({ state, onChange }: Props) {
  return (
    <section>
      <h2 className="section-title admin-alsa-title">Level</h2>
      <div className="global-row">
        <label>
          <span>{state.label}</span>
          <span>{Math.round(state.value * 100)}%</span>
        </label>
        <input
          type="range"
          min={state.min}
          max={state.max}
          step={0.01}
          value={state.value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
      <p className="runtime-mode-hint" style={{ marginTop: "0.35rem" }}>
        ALSA: <code>{state.control}</code>
      </p>
    </section>
  );
}
