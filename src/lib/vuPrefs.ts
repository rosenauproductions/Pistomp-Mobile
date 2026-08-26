/** VU meter display prefs (main-screen strip). */

export type VuStyle = "led" | "needle";
/** Stereo L/R, or one summed meter for input 1+2 / output 1+2. */
export type VuMode = "inputs" | "outputs" | "sum-in" | "sum-out";

const SHOW_KEY = "pistomp-mobile-show-vu";
const STYLE_KEY = "pistomp-mobile-vu-style";
const MODE_KEY = "pistomp-mobile-vu-mode";

export function getShowVu(): boolean {
  try {
    const v = localStorage.getItem(SHOW_KEY);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

export function setShowVu(show: boolean): void {
  try {
    localStorage.setItem(SHOW_KEY, show ? "1" : "0");
  } catch {
    /* private mode */
  }
}

export function getVuStyle(): VuStyle {
  try {
    const v = localStorage.getItem(STYLE_KEY);
    if (v === "led" || v === "needle") return v;
  } catch {
    /* private mode */
  }
  return "led";
}

export function setVuStyle(style: VuStyle): void {
  try {
    localStorage.setItem(STYLE_KEY, style);
  } catch {
    /* private mode */
  }
}

export function getVuMode(): VuMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === "inputs" || v === "outputs" || v === "sum-in" || v === "sum-out") return v;
    // legacy "summed" (dual Sum In / Sum Out) → input 1+2
    if (v === "summed") return "sum-in";
  } catch {
    /* private mode */
  }
  return "sum-in";
}

export function setVuMode(mode: VuMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* private mode */
  }
}
