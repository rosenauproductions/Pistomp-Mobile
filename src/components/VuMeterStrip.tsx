import { VuMeterLed } from "./VuMeterLed";
import { VuMeterNeedle } from "./VuMeterNeedle";
import { levelsForMode, useVuLevels } from "../hooks/useVuLevels";
import type { VuMode, VuStyle } from "../lib/vuPrefs";

interface Props {
  style: VuStyle;
  mode: VuMode;
}

export function VuMeterStrip({ style, mode }: Props) {
  const levels = useVuLevels(true);
  const channels = levelsForMode(levels, mode);
  const single = channels.length === 1;

  return (
    <section className="vu-strip" aria-label="VU meters">
      <div className={`vu-strip-grid${single ? " vu-strip-grid--single" : ""}`}>
        {channels.map((ch) =>
          style === "led" ? (
            <VuMeterLed key={ch.label} level={ch.level} label={ch.label} />
          ) : (
            <VuMeterNeedle key={ch.label} level={ch.level} label={ch.label} />
          ),
        )}
      </div>
    </section>
  );
}
