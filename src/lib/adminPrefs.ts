const HARDWARE_INPUT_VISIBLE_KEY = "pistomp-mobile-show-hardware-input";
const HIDE_UNASSIGNED_MIDI_KEY = "pistomp-mobile-hide-unassigned-midi";

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

/** When true, EffectGrid hides plugins with no MIDI CC assignment. Default off. */
export function getHideUnassignedMidi(): boolean {
  try {
    const v = localStorage.getItem(HIDE_UNASSIGNED_MIDI_KEY);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

export function setHideUnassignedMidi(hide: boolean): void {
  try {
    localStorage.setItem(HIDE_UNASSIGNED_MIDI_KEY, hide ? "1" : "0");
  } catch {
    /* private mode */
  }
}
