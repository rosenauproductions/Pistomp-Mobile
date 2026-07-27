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
