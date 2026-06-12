const HARDWARE_INPUT_VISIBLE_KEY = "pistomp-mobile-show-hardware-input";

export function getShowHardwareInput(): boolean {
  try {
    const v = localStorage.getItem(HARDWARE_INPUT_VISIBLE_KEY);
    if (v === "1" || v === "true") return true;
    return false;
  } catch {
    return false;
  }
}

export function setShowHardwareInput(visible: boolean): void {
  try {
    localStorage.setItem(HARDWARE_INPUT_VISIBLE_KEY, visible ? "1" : "0");
  } catch {
    /* private mode */
  }
}
