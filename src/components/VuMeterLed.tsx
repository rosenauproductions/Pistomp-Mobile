interface Props {
  /** Normalized 0–1 level */
  level: number;
  label: string;
  /** When true, label is only used for aria (tile head shows the name). */
  hideLabel?: boolean;
}

const SEGMENTS = 28;
const START_DEG = -140;
const END_DEG = 140;

function segmentColor(i: number): string {
  const t = i / (SEGMENTS - 1);
  if (t < 0.55) return "#3dcf4a";
  if (t < 0.78) return "#e8c23a";
  if (t < 0.9) return "#f08a28";
  return "#e83838";
}

/** Curved LED-bar VU. */
export function VuMeterLed({ level, label, hideLabel = false }: Props) {
  const lit = Math.round(Math.min(1, Math.max(0, level)) * SEGMENTS);
  const cx = 100;
  const cy = 108;
  const r = 78;
  const span = END_DEG - START_DEG;

  const ticks = [-25, -20, -15, -10, -5, 0, 5, 10, 14];

  return (
    <div className="vu-led" role="img" aria-label={`${label} ${Math.round(level * 100)}%`}>
      <svg className="vu-led-svg" viewBox="0 0 200 140" aria-hidden="true">
        {ticks.map((db) => {
          // Map -25..+14 → 0..1 along the arc
          const t = (db + 25) / 39;
          const deg = START_DEG + t * span;
          const rad = (deg * Math.PI) / 180;
          const x1 = cx + Math.sin(rad) * (r + 6);
          const y1 = cy - Math.cos(rad) * (r + 6);
          const x2 = cx + Math.sin(rad) * (r + 14);
          const y2 = cy - Math.cos(rad) * (r + 14);
          const tx = cx + Math.sin(rad) * (r + 22);
          const ty = cy - Math.cos(rad) * (r + 22);
          return (
            <g key={db}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} className="vu-led-tick" />
              <text x={tx} y={ty} className="vu-led-tick-label" textAnchor="middle" dominantBaseline="middle">
                {db > 0 ? `+${db}` : db}
              </text>
            </g>
          );
        })}

        {Array.from({ length: SEGMENTS }, (_, i) => {
          const t0 = i / SEGMENTS;
          const t1 = (i + 0.72) / SEGMENTS;
          const d0 = START_DEG + t0 * span;
          const d1 = START_DEG + t1 * span;
          const r0 = (d0 * Math.PI) / 180;
          const r1 = (d1 * Math.PI) / 180;
          const inner = r - 14;
          const outer = r;
          const x0i = cx + Math.sin(r0) * inner;
          const y0i = cy - Math.cos(r0) * inner;
          const x0o = cx + Math.sin(r0) * outer;
          const y0o = cy - Math.cos(r0) * outer;
          const x1o = cx + Math.sin(r1) * outer;
          const y1o = cy - Math.cos(r1) * outer;
          const x1i = cx + Math.sin(r1) * inner;
          const y1i = cy - Math.cos(r1) * inner;
          const on = i < lit;
          return (
            <path
              key={i}
              d={`M ${x0i} ${y0i} L ${x0o} ${y0o} L ${x1o} ${y1o} L ${x1i} ${y1i} Z`}
              fill={on ? segmentColor(i) : "#1a1a1a"}
              className={on ? "vu-led-seg on" : "vu-led-seg"}
              style={on ? { filter: `drop-shadow(0 0 2px ${segmentColor(i)})` } : undefined}
            />
          );
        })}

        <text x={cx} y={cy - 8} className="vu-led-db" textAnchor="middle">
          dB
        </text>
      </svg>
      {!hideLabel && <span className="vu-meter-label">{label}</span>}
    </div>
  );
}
