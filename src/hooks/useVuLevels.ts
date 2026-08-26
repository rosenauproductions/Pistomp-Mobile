import { useEffect, useState } from "react";
import { fetchVuPeaks } from "../api/pistompAudio";
import { isPiStompMode } from "../lib/runtimeMode";
import type { VuMode } from "../lib/vuPrefs";

/** Normalized 0–1 peak levels for the four hardware channels. */
export interface VuLevels {
  inL: number;
  inR: number;
  outL: number;
  outR: number;
}

const ZERO: VuLevels = { inL: 0, inR: 0, outL: 0, outR: 0 };

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Live peaks from `/pistomp/audio/peaks` on Pi-Stomp.
 * Idle (zeros) when not on the Pi or when peaks are unavailable — no demo motion.
 */
export function useVuLevels(active: boolean): VuLevels {
  const [levels, setLevels] = useState<VuLevels>(ZERO);

  useEffect(() => {
    if (!active || !isPiStompMode()) {
      setLevels(ZERO);
      return;
    }

    let cancelled = false;
    let pollTimer = 0;
    let last = performance.now();
    const held = { ...ZERO };

    const applyBallistics = (raw: VuLevels, dt: number) => {
      const attack = 1 - Math.exp(-dt * 28);
      const release = 1 - Math.exp(-dt * 3.2);
      (Object.keys(held) as (keyof VuLevels)[]).forEach((k) => {
        const target = raw[k];
        const coeff = target > held[k] ? attack : release;
        held[k] += (target - held[k]) * coeff;
      });
      setLevels({ ...held });
    };

    const pollLive = async () => {
      const peaks = await fetchVuPeaks();
      if (cancelled) return;
      const now = performance.now();
      const dt = Math.min(0.08, (now - last) / 1000);
      last = now;
      if (peaks?.available) {
        applyBallistics(
          {
            inL: clamp01(peaks.inL),
            inR: clamp01(peaks.inR),
            outL: clamp01(peaks.outL),
            outR: clamp01(peaks.outR),
          },
          dt,
        );
      } else {
        applyBallistics(ZERO, dt);
      }
    };

    void pollLive();
    pollTimer = window.setInterval(() => void pollLive(), 50);

    return () => {
      cancelled = true;
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, [active]);

  return levels;
}

export type VuDisplayChannel = { level: number; label: string };

/** Map mode to one or two display channels (0–1). */
export function levelsForMode(levels: VuLevels, mode: VuMode): VuDisplayChannel[] {
  if (mode === "inputs") {
    return [
      { level: levels.inL, label: "In L" },
      { level: levels.inR, label: "In R" },
    ];
  }
  if (mode === "outputs") {
    return [
      { level: levels.outL, label: "Out L" },
      { level: levels.outR, label: "Out R" },
    ];
  }
  if (mode === "sum-out") {
    return [
      {
        level: clamp01(Math.sqrt((levels.outL ** 2 + levels.outR ** 2) / 2)),
        label: "Output 1+2",
      },
    ];
  }
  return [
    {
      level: clamp01(Math.sqrt((levels.inL ** 2 + levels.inR ** 2) / 2)),
      label: "Input 1+2",
    },
  ];
}
