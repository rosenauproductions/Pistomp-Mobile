export type DisplayRotation = "portrait" | "90" | "-90";

const KEY = "pistomp-mobile-display-rotation";

export function getDisplayRotation(): DisplayRotation {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "90" || v === "-90" || v === "portrait") return v;
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
 * Lock the device orientation so it matches our Display setting.
 * CSS ±90° expects the phone to stay physically portrait — lock portrait for all modes
 * so the browser does not fight the visual rotate.
 * Best chance of success: call from a tap (Settings buttons). May no-op on plain HTTP / non-PWA.
 */
export async function lockDisplayOrientation(_rotation: DisplayRotation): Promise<void> {
  const orient = screen.orientation as ScreenOrientation & {
    lock?: (orientation: string) => Promise<void>;
  };
  if (typeof orient?.lock !== "function") return;

  // Prefer portrait so CSS rotate (±90) is not double-applied by the browser.
  for (const type of ["portrait", "portrait-primary"] as const) {
    try {
      await orient.lock(type);
      return;
    } catch {
      /* try next / unsupported */
    }
  }
}
