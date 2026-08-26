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
  const { a, b, labelA, labelB } = levelsForMode(levels, mode);

  return (
    <section className="vu-strip" aria-label="VU meters">
      <div className="vu-strip-grid">
        {style === "led" ? (
          <>
            <VuMeterLed level={a} label={labelA} />
            <VuMeterLed level={b} label={labelB} />
          </>
        ) : (
          <>
            <VuMeterNeedle level={a} label={labelA} />
            <VuMeterNeedle level={b} label={labelB} />
          </>
        )}
      </div>
    </section>
  );
}
