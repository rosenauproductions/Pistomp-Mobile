import { useCallback, useId, useRef, useState } from "react";

interface Props {
  /** Effect on/off — shown on LED only; switch is momentary. */
  active: boolean;
  label: string;
  onPress: () => void;
}

/** Chrome momentary footswitch — animates down on tap; LED reflects bypass state. */
export function StompSwitch({ active, label, onPress }: Props) {
  const uid = useId().replace(/:/g, "");
  const g = (name: string) => `${uid}-${name}`;
  const [down, setDown] = useState(false);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const depress = useCallback(() => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    setDown(true);
  }, []);

  const release = useCallback(() => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    releaseTimer.current = setTimeout(() => setDown(false), 90);
  }, []);

  return (
    <button
      type="button"
      className={`stomp-switch ${down ? "down" : ""}`}
      aria-label={label}
      aria-pressed={active}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        depress();
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onClick={onPress}
    >
      <svg
        className="stomp-switch-svg"
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <radialGradient id={g("hole")} cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#2a2e34" />
            <stop offset="70%" stopColor="#121418" />
            <stop offset="100%" stopColor="#08090b" />
          </radialGradient>

          <linearGradient id={g("hex")} x1="20%" y1="15%" x2="85%" y2="90%">
            <stop offset="0%" stopColor="#f4f6f8" />
            <stop offset="22%" stopColor="#c8cdd4" />
            <stop offset="48%" stopColor="#8e96a3" />
            <stop offset="72%" stopColor="#5c6470" />
            <stop offset="100%" stopColor="#3a4048" />
          </linearGradient>

          <linearGradient id={g("hexEdge")} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
          </linearGradient>

          <radialGradient id={g("capUp")} cx="38%" cy="32%" r="68%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="18%" stopColor="#e8ecf0" />
            <stop offset="42%" stopColor="#a8b0ba" />
            <stop offset="68%" stopColor="#6e7784" />
            <stop offset="88%" stopColor="#454c57" />
            <stop offset="100%" stopColor="#2a3038" />
          </radialGradient>

          <radialGradient id={g("capDown")} cx="48%" cy="58%" r="62%">
            <stop offset="0%" stopColor="#9aa3ae" />
            <stop offset="35%" stopColor="#6b737e" />
            <stop offset="70%" stopColor="#454b55" />
            <stop offset="100%" stopColor="#252930" />
          </radialGradient>

          <radialGradient id={g("capRing")} cx="50%" cy="50%" r="50%">
            <stop offset="82%" stopColor="transparent" />
            <stop offset="88%" stopColor="#1a1d22" stopOpacity="0.9" />
            <stop offset="96%" stopColor="#0a0b0d" />
            <stop offset="100%" stopColor="#000000" />
          </radialGradient>
        </defs>

        <circle cx="50" cy="50" r="46" fill={`url(#${g("hole")})`} />

        <polygon
          points={hexPoints(50, 50, 38)}
          fill={`url(#${g("hex")})`}
          stroke="#2a2f36"
          strokeWidth="0.6"
        />
        <polygon
          points={hexPoints(50, 50, 36.5)}
          fill="none"
          stroke={`url(#${g("hexEdge")})`}
          strokeWidth="1.2"
          opacity="0.65"
        />

        <circle
          cx="50"
          cy={down ? 52 : 50}
          r={down ? 30 : 28}
          fill="#0c0d10"
          stroke="#1e2228"
          strokeWidth="1"
        />
        <circle
          cx="50"
          cy={down ? 52 : 50}
          r={down ? 28.5 : 26.5}
          fill="none"
          stroke="#000000"
          strokeWidth="2.5"
          opacity="0.55"
        />

        <g
          className="stomp-cap"
          transform={
            down
              ? "translate(50 52) scale(0.9) translate(-50 -50)"
              : "translate(50 49) scale(1) translate(-50 -50)"
          }
        >
          <circle cx="50" cy="50" r="25.5" fill={`url(#${down ? g("capDown") : g("capUp")})`} />
          <circle cx="50" cy="50" r="25.5" fill={`url(#${g("capRing")})`} />
          <ellipse
            cx="42"
            cy={down ? 44 : 40}
            rx="11"
            ry="6"
            fill="#ffffff"
            opacity={down ? 0.12 : 0.35}
          />
          <circle cx="40" cy={down ? 42 : 38} r="3" fill="#ffffff" opacity={down ? 0.2 : 0.5} />
        </g>
      </svg>
    </button>
  );
}

function hexPoints(cx: number, cy: number, radius: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = ((60 * i - 30) * Math.PI) / 180;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}
