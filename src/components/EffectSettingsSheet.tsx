import { getEditablePorts } from "../api/modui";
import {
  formatPortValue,
  portDisplayPercent,
  portSliderMax,
  portSliderMin,
  portSliderStep,
} from "../api/portUtils";
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
            const min = portSliderMin(port);
            const max = portSliderMax(port);
            const pct = portDisplayPercent(port);
            return (
              <div key={port.symbol} className="global-row">
                <label>
                  <span>{port.symbol}</span>
                  <span>
                    {formatPortValue(port)} ({pct}%)
                  </span>
                </label>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={portSliderStep(port)}
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
