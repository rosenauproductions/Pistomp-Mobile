interface Props {
  /** Normalized 0–1 level (0 = left/−20, ~0.75 = 0 VU, 1 = +3) */
  level: number;
  label: string;
}

/** Map 0–1 to needle angle (degrees). Left rest ≈ -48°, 0 VU ≈ 0°, +3 ≈ +48°. */
function levelToAngle(level: number): number {
  const n = Math.min(1, Math.max(0, level));
  // Classic VU: more travel in lower range
  const vu = n < 0.75 ? (n / 0.75) * 0.7 : 0.7 + ((n - 0.75) / 0.25) * 0.3;
  return -48 + vu * 96;
}

/** Square vintage circular needle VU (SVG face, no branding). */
export function VuMeterNeedle({ level, label }: Props) {
  const angle = levelToAngle(level);
  const cx = 100;
  const cy = 118;
  const r = 78;

  const ticksVu = [
    { v: -20, a: -48 },
    { v: -10, a: -32 },
    { v: -7, a: -24 },
    { v: -5, a: -18 },
    { v: -3, a: -12 },
    { v: -2, a: -8 },
    { v: -1, a: -4 },
    { v: 0, a: 0 },
    { v: 1, a: 12 },
    { v: 2, a: 28 },
    { v: 3, a: 48 },
  ];

  const pct = [
    { v: 0, a: -48 },
    { v: 20, a: -28 },
    { v: 40, a: -12 },
    { v: 60, a: 0 },
    { v: 80, a: 18 },
    { v: 100, a: 48 },
  ];

  // red zone arc from 0° to +48°
  const redPath = (() => {
    const a0 = 0;
    const a1 = 48;
    const rr = r - 2;
    const r0 = (a0 * Math.PI) / 180;
    const r1 = (a1 * Math.PI) / 180;
    const x0 = cx + Math.sin(r0) * rr;
    const y0 = cy - Math.cos(r0) * rr;
    const x1 = cx + Math.sin(r1) * rr;
    const y1 = cy - Math.cos(r1) * rr;
    return `M ${x0} ${y0} A ${rr} ${rr} 0 0 1 ${x1} ${y1}`;
  })();

  return (
    <div className="vu-needle" role="img" aria-label={`${label} ${Math.round(level * 100)}%`}>
      <div className="vu-needle-frame">
        <svg className="vu-needle-svg" viewBox="0 0 200 160" aria-hidden="true">
          {/* cream dial */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} L ${cx + 28} ${cy} A 28 28 0 0 0 ${cx - 28} ${cy} Z`}
            className="vu-needle-face"
          />
          <path d={redPath} className="vu-needle-redzone" fill="none" />

          {ticksVu.map((t) => {
            const rad = (t.a * Math.PI) / 180;
            const major = t.v === 0 || t.v === -20 || t.v === 3;
            const len = major ? 12 : 8;
            const x1 = cx + Math.sin(rad) * (r - 4);
            const y1 = cy - Math.cos(rad) * (r - 4);
            const x2 = cx + Math.sin(rad) * (r - 4 - len);
            const y2 = cy - Math.cos(rad) * (r - 4 - len);
            const tx = cx + Math.sin(rad) * (r - 22);
            const ty = cy - Math.cos(rad) * (r - 22);
            const red = t.v > 0;
            return (
              <g key={`vu-${t.v}`}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  className={red ? "vu-needle-tick red" : "vu-needle-tick"}
                />
                <text
                  x={tx}
                  y={ty}
                  className={red ? "vu-needle-num red" : "vu-needle-num"}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {Math.abs(t.v)}
                </text>
              </g>
            );
          })}

          {pct.map((t) => {
            const rad = (t.a * Math.PI) / 180;
            const x = cx + Math.sin(rad) * (r - 38);
            const y = cy - Math.cos(rad) * (r - 38);
            return (
              <text key={`p-${t.v}`} x={x} y={y} className="vu-needle-pct" textAnchor="middle" dominantBaseline="middle">
                {t.v}
              </text>
            );
          })}

          <text x={cx - 58} y={cy - 28} className="vu-needle-sign" textAnchor="middle">
            −
          </text>
          <text x={cx + 58} y={cy - 28} className="vu-needle-sign red" textAnchor="middle">
            +
          </text>
          <text x={cx} y={cy - 42} className="vu-needle-vu" textAnchor="middle">
            VU
          </text>

          {/* pivot well */}
          <circle cx={cx} cy={cy} r={22} className="vu-needle-well" />

          <g
            className="vu-needle-arm"
            style={{
              transform: `rotate(${angle}deg)`,
              transformOrigin: `${cx}px ${cy}px`,
            }}
          >
            <line x1={cx} y1={cy} x2={cx} y2={cy - (r - 10)} className="vu-needle-line" />
            <circle cx={cx} cy={cy} r={4} className="vu-needle-hub" />
          </g>
        </svg>
      </div>
      <span className="vu-meter-label">{label}</span>
    </div>
  );
}
