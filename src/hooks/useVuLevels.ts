import { useEffect, useState } from "react";

/** Normalized 0–1 peak levels for the four hardware channels. */
export interface VuLevels {
  inL: number;
  inR: number;
  outL: number;
  outR: number;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Phase 1: demo signal with VU-ish ballistics (fast attack, slow release).
 * Phase 2: swap body to poll `/pistomp/audio/peaks` and keep the same return shape.
 */
export function useVuLevels(active: boolean): VuLevels {
  const [levels, setLevels] = useState<VuLevels>({
    inL: 0,
    inR: 0,
    outL: 0,
    outR: 0,
  });

  useEffect(() => {
    if (!active) {
      setLevels({ inL: 0, inR: 0, outL: 0, outR: 0 });
      return;
    }

    let raf = 0;
    let last = performance.now();
    const held = { inL: 0, inR: 0, outL: 0, outR: 0 };
    const t0 = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;

      // Independent-ish demo sources (pseudo program material)
      const raw = {
        inL: clamp01(0.35 + 0.45 * Math.abs(Math.sin(t * 2.1)) + 0.12 * Math.sin(t * 11.3)),
        inR: clamp01(0.32 + 0.48 * Math.abs(Math.sin(t * 2.1 + 0.4)) + 0.1 * Math.sin(t * 9.7)),
        outL: clamp01(0.28 + 0.5 * Math.abs(Math.sin(t * 1.7 + 0.2)) + 0.15 * Math.sin(t * 7.1)),
        outR: clamp01(0.3 + 0.47 * Math.abs(Math.sin(t * 1.7 + 0.55)) + 0.12 * Math.sin(t * 8.4)),
      };

      const attack = 1 - Math.exp(-dt * 28);
      const release = 1 - Math.exp(-dt * 3.2);

      (Object.keys(held) as (keyof VuLevels)[]).forEach((k) => {
        const target = raw[k];
        const coeff = target > held[k] ? attack : release;
        held[k] += (target - held[k]) * coeff;
      });

      setLevels({ ...held });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return levels;
}

/** Map mode channels to two display values (0–1). */
export function levelsForMode(
  levels: VuLevels,
  mode: "inputs" | "outputs" | "summed",
): { a: number; b: number; labelA: string; labelB: string } {
  if (mode === "inputs") {
    return { a: levels.inL, b: levels.inR, labelA: "In L", labelB: "In R" };
  }
  if (mode === "outputs") {
    return { a: levels.outL, b: levels.outR, labelA: "Out L", labelB: "Out R" };
  }
  const sumIn = clamp01(Math.sqrt((levels.inL ** 2 + levels.inR ** 2) / 2));
  const sumOut = clamp01(Math.sqrt((levels.outL ** 2 + levels.outR ** 2) / 2));
  return { a: sumIn, b: sumOut, labelA: "Sum In", labelB: "Sum Out" };
}
