/** How Pistomp-Mobile talks to MOD — not shipped behavior on the Pi install. */
export type RuntimeMode = "pistomp" | "modDesktop";

const STORAGE_KEY = "pistomp-mobile-runtime";

export const RUNTIME_MODE_HEADER = "X-Pistomp-Runtime";

export function getDefaultRuntimeMode(): RuntimeMode {
  return import.meta.env.PROD ? "pistomp" : "modDesktop";
}

export function getRuntimeMode(): RuntimeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "pistomp" || stored === "modDesktop") return stored;
  return getDefaultRuntimeMode();
}

export function setRuntimeMode(mode: RuntimeMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
}

/** True when the UI is served from the Pi (ignore dev localStorage). */
export function isOnPiStompDevice(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "pistomp.local" || h === "172.24.1.1";
}

export function isModDesktopMode(): boolean {
  if (isOnPiStompDevice()) return false;
  return getRuntimeMode() === "modDesktop";
}

export function isPiStompMode(): boolean {
  if (isOnPiStompDevice()) return true;
  return getRuntimeMode() === "pistomp";
}

/** Settings toggle only in local dev — production Pi build is always Pi-Stomp mode. */
export function isRuntimeModeToggleVisible(): boolean {
  return import.meta.env.DEV;
}
