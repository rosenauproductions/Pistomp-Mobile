import { getEditablePorts } from "../api/modui";
import type { EffectPlugin } from "../api/types";
import { Sheet } from "./Sheet";

interface Props {
  plugin: EffectPlugin | null;
  open: boolean;
  onClose: () => void;
  onChange: (instance: string, port: string, value: number) => void;
}

export function EffectSettingsSheet({ plugin, open, onClose, onChange }: Props) {
  if (!plugin) return null;

  const ports = getEditablePorts(plugin.ports);
  const title = plugin.title ?? plugin.instance;

  return (
    <Sheet title={title} open={open} onClose={onClose}>
      <div className="effect-settings">
        {ports.length === 0 ? (
          <p className="effect-settings-empty">No adjustable parameters for this effect.</p>
        ) : (
          ports.map((port) => {
            const min = port.minimum ?? 0;
            const max = port.maximum ?? 1;
            const pct = max > min ? Math.round(((port.value - min) / (max - min)) * 100) : 0;
            return (
              <div key={port.symbol} className="global-row">
                <label>
                  <span>{port.symbol}</span>
                  <span>{pct}%</span>
                </label>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={(max - min) / 100}
                  value={port.value}
                  onChange={(e) => onChange(plugin.instance, port.symbol, Number(e.target.value))}
                />
              </div>
            );
          })
        )}
      </div>
    </Sheet>
  );
}
