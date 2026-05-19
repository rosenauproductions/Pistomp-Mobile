/** Parse MOD plugin color (#rgb, #rrggbb) → #rrggbb or null. */
export function normalizeHex(color: string | undefined): string | null {
  if (!color?.trim()) return null;
  const c = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    const [, r, g, b] = c;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.slice(1);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.round(Math.max(0, Math.min(255, n)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Blend hex color toward black (amount 0–1). */
export function shadeHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = 1 - amount;
  return rgbToHex(r * f, g * f, b * f);
}

/** Stable accent from URI when MOD has no color metadata. */
export function colorFromUri(uri: string): string {
  let hash = 0;
  for (let i = 0; i < uri.length; i++) hash = (hash * 31 + uri.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return hslToHex(hue, 42, 38);
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lit = l / 100;
  const c = (1 - Math.abs(2 * lit - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lit - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export type EffectCardVars = Record<string, string>;

export function effectCardVars(color: string | undefined, uri?: string): EffectCardVars {
  const hex = normalizeHex(color) ?? (uri ? colorFromUri(uri) : null);
  if (!hex) return {};
  return {
    "--effect-accent": hex,
    "--effect-bg-top": shadeHex(hex, 0.55),
    "--effect-bg-bottom": shadeHex(hex, 0.78),
    "--effect-border": shadeHex(hex, 0.35),
  };
}
