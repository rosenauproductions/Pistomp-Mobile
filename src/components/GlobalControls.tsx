import type { GlobalControl } from "../api/types";

interface Props {
  controls: GlobalControl[];
  onChange: (ctrl: GlobalControl, value: number) => void;
}

export function GlobalControls({ controls, onChange }: Props) {
  if (controls.length === 0) return null;

  return (
    <section>
      <h2 className="section-title">Quick controls</h2>
      {controls.map((ctrl) => (
        <div key={ctrl.kind} className="global-row">
          <label>
            <span>{ctrl.label}</span>
            <span>{Math.round(ctrl.value * 100)}%</span>
          </label>
          <input
            type="range"
            min={ctrl.min}
            max={ctrl.max}
            step={0.01}
            value={ctrl.value}
            onChange={(e) => onChange(ctrl, Number(e.target.value))}
          />
        </div>
      ))}
    </section>
  );
}
