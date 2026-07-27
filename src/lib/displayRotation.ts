export type DisplayRotation = "portrait" | "landscape" | "90" | "-90";

const KEY = "pistomp-mobile-display-rotation";

export function getDisplayRotation(): DisplayRotation {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "90" || v === "-90" || v === "portrait" || v === "landscape") return v;
  } catch {
    /* private mode */
  }
  return "portrait";
}

export function setDisplayRotation(rotation: DisplayRotation): void {
  try {
    localStorage.setItem(KEY, rotation);
  } catch {
    /* private mode */
  }
}

/**
 * Portrait / ±90: prefer portrait lock (in-slot pedal spin must not fight the browser).
 * Landscape: prefer landscape lock so the 0°-rotation layout can use the wide viewport.
 */
export async function lockDisplayOrientation(rotation: DisplayRotation): Promise<void> {
  const orient = screen.orientation as ScreenOrientation & {
    lock?: (orientation: string) => Promise<void>;
  };
  if (typeof orient?.lock !== "function") return;

  const types =
    rotation === "landscape"
      ? (["landscape", "landscape-primary", "landscape-secondary"] as const)
      : (["portrait", "portrait-primary"] as const);

  for (const type of types) {
    try {
      await orient.lock(type);
      return;
    } catch {
      /* try next / unsupported */
    }
  }
}
