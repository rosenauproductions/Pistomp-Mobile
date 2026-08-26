import { VuMeterLed } from "./VuMeterLed";
import { VuMeterNeedle } from "./VuMeterNeedle";
import { levelsForMode, useVuLevels } from "../hooks/useVuLevels";
import type { VuMode, VuStyle } from "../lib/vuPrefs";

interface Props {
  style: VuStyle;
  mode: VuMode;
}

/** Pedal-sized VU tiles for the effects grid (leading slots). */
export function VuMeterStrip({ style, mode }: Props) {
  const levels = useVuLevels(true);
  const channels = levelsForMode(levels, mode);

  return (
    <>
      {channels.map((ch) => (
        <div key={ch.label} className="effect-slot vu-tile-slot">
          <article className="effect vu-tile" aria-label={`${ch.label} VU meter`}>
            <div className="effect-head">
              <span className="effect-name" title={ch.label}>
                {ch.label}
              </span>
            </div>
            <div className="vu-tile-body">
              {style === "led" ? (
                <VuMeterLed level={ch.level} label={ch.label} hideLabel />
              ) : (
                <VuMeterNeedle level={ch.level} label={ch.label} hideLabel />
              )}
            </div>
          </article>
        </div>
      ))}
    </>
  );
}
