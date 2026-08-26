import { isPiStompMode } from "../lib/runtimeMode";

const CONTROL_KEY = "pistomp-mobile-alsa-control";

export interface AlsaControl {
  name: string;
  label: string;
}

export interface HardwareInputState {
  available: boolean;
  controls: AlsaControl[];
  control: string;
  label: string;
  value: number;
  min: number;
  max: number;
}

function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `/pistomp/audio${p}`;
}

export function getStoredAlsaControl(): string | null {
  return localStorage.getItem(CONTROL_KEY);
}

export function setStoredAlsaControl(name: string): void {
  localStorage.setItem(CONTROL_KEY, name);
}

export async function fetchAlsaControls(): Promise<AlsaControl[] | null> {
  if (!isPiStompMode()) return null;
  try {
    const res = await fetch(apiUrl("/controls"));
    if (!res.ok) return null;
    const data = (await res.json()) as { controls?: AlsaControl[] };
    return data.controls?.length ? data.controls : null;
  } catch {
    return null;
  }
}

export async function fetchAlsaValue(control: string): Promise<{
  value: number;
  min: number;
  max: number;
} | null> {
  try {
    const res = await fetch(apiUrl(`/value?control=${encodeURIComponent(control)}`));
    if (!res.ok) return null;
    const data = (await res.json()) as {
      value?: number;
      minDb?: number;
      maxDb?: number;
    };
    if (typeof data.value !== "number") return null;
    return { value: data.value, min: 0, max: 1 };
  } catch {
    return null;
  }
}

export async function setAlsaValue(control: string, value: number): Promise<boolean> {
  try {
    const res = await fetch(apiUrl("/value"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ control, value }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return data.ok !== false;
  } catch {
    return false;
  }
}

export async function fetchVuPeaks(): Promise<{
  available: boolean;
  inL: number;
  inR: number;
  outL: number;
  outR: number;
  error?: string;
} | null> {
  try {
    const res = await fetch(apiUrl("/peaks"), { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      available?: boolean;
      inL?: number;
      inR?: number;
      outL?: number;
      outR?: number;
      error?: string;
    };
    return {
      available: Boolean(data.available),
      inL: typeof data.inL === "number" ? data.inL : 0,
      inR: typeof data.inR === "number" ? data.inR : 0,
      outL: typeof data.outL === "number" ? data.outL : 0,
      outR: typeof data.outR === "number" ? data.outR : 0,
      error: data.error,
    };
  } catch {
    return null;
  }
}

export async function loadHardwareInputState(
  preferredControl?: string | null,
): Promise<HardwareInputState | null> {
  const controls = await fetchAlsaControls();
  if (!controls?.length) return null;

  const stored = preferredControl ?? getStoredAlsaControl();
  const pick =
    controls.find((c) => c.name === stored) ??
    controls.find((c) => /aux|capture|input/i.test(c.label) || /aux/i.test(c.name)) ??
    controls[0];

  const levels = await fetchAlsaValue(pick.name);
  if (!levels) return null;

  return {
    available: true,
    controls,
    control: pick.name,
    label: pick.label,
    value: levels.value,
    min: levels.min,
    max: levels.max,
  };
}
