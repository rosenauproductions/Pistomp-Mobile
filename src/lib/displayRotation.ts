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
 * Prefer portrait lock so the browser does not also rotate the page
 * while Display ±90 only spins each pedal in its slot.
 */
export async function lockDisplayOrientation(_rotation: DisplayRotation): Promise<void> {
  const orient = screen.orientation as ScreenOrientation & {
    lock?: (orientation: string) => Promise<void>;
  };
  if (typeof orient?.lock !== "function") return;

  for (const type of ["portrait", "portrait-primary"] as const) {
    try {
      await orient.lock(type);
      return;
    } catch {
      /* try next / unsupported */
    }
  }
}
