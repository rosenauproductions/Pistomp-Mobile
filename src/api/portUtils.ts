import type { EffectPlugin, EffectPort, MidiCc } from "./types";

type RangeMeta = { minimum?: number; maximum?: number };
type PortLike = EffectPort & { ranges?: RangeMeta; midiCC?: MidiCc };

function readRange(raw: PortLike): { minimum?: number; maximum?: number } {
  const min = raw.minimum ?? raw.ranges?.minimum;
  const max = raw.maximum ?? raw.ranges?.maximum;
  if (typeof min === "number" && typeof max === "number") {
    return { minimum: min, maximum: max };
  }
  return {};
}

function readMidiCc(raw: unknown): MidiCc | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.channel !== "number" || typeof o.control !== "number") return undefined;
  return {
    channel: o.channel,
    control: o.control,
    ...(typeof o.hasRanges === "boolean" ? { hasRanges: o.hasRanges } : {}),
    ...(typeof o.minimum === "number" ? { minimum: o.minimum } : {}),
    ...(typeof o.maximum === "number" ? { maximum: o.maximum } : {}),
  };
}

export function normalizeEffectPort(raw: PortLike): EffectPort {
  const { minimum, maximum } = readRange(raw);
  const midiCC = readMidiCc(raw.midiCC);
  return {
    symbol: raw.symbol,
    value: Number(raw.value),
    valid: raw.valid,
    ...(minimum !== undefined ? { minimum } : {}),
    ...(maximum !== undefined ? { maximum } : {}),
    ...(midiCC ? { midiCC } : {}),
  };
}

export function normalizePluginPorts(plugin: EffectPlugin): EffectPlugin {
  const bypassCC = readMidiCc((plugin as EffectPlugin & { bypassCC?: unknown }).bypassCC);
  const normalized = {
    ...plugin,
    ...(bypassCC ? { bypassCC } : {}),
    ports: plugin.ports.map((p) => normalizeEffectPort(p as PortLike)),
  };
  return { ...normalized, bypassed: deriveBypassedFromPlugin(normalized) };
}

/** Map native port value → UI bypassed (per-plugin LV2 conventions). */
export function stompNativeBypassed(portSymbol: string, value: number): boolean {
  const high = value >= 0.5;
  if (/^enable$/i.test(portSymbol)) return !high;
  if (portSymbol === "BYPASS") return !high;
  if (/^bypass$/i.test(portSymbol)) return high;
  return !high;
}

export function stompNativeValueForBypassed(
  portSymbol: string,
  bypassed: boolean,
  minimum = 0,
  maximum = 1,
): number {
  const lo = minimum;
  const hi = maximum;
  if (/^enable$/i.test(portSymbol)) return bypassed ? lo : hi;
  if (portSymbol === "BYPASS") return bypassed ? lo : hi;
  if (/^bypass$/i.test(portSymbol)) return bypassed ? hi : lo;
  return bypassed ? lo : hi;
}

/** Prefer native bypass/enable port over stale `/pedalboard/info/` bypassed flag. */
export function deriveBypassedFromPlugin(plugin: EffectPlugin): boolean {
  const sym = findNativeBypassPort(plugin);
  if (!sym) return plugin.bypassed;
  const pt = plugin.ports.find((p) => p.symbol === sym);
  if (!pt) return plugin.bypassed;
  return stompNativeBypassed(sym, pt.value);
}

function extractRangesFromEffectGet(data: unknown): Map<string, { minimum: number; maximum: number }> {
  const map = new Map<string, { minimum: number; maximum: number }>();
  const root = data as Record<string, unknown> | null;
  if (!root) return map;

  const ports = root.ports as Record<string, unknown> | undefined;
  const control = ports?.control as Record<string, unknown> | undefined;
  const inputs = (control?.input ?? control?.Input) as unknown[] | undefined;
  if (!Array.isArray(inputs)) return map;

  for (const item of inputs) {
    const p = item as PortLike & { shortName?: string; name?: string };
    const sym = p.symbol ?? p.shortName;
    if (!sym) continue;
    const { minimum, maximum } = readRange(p);
    if (minimum !== undefined && maximum !== undefined) {
      map.set(sym, { minimum, maximum });
    }
  }
  return map;
}

export async function enrichPluginPortRanges(
  plugins: EffectPlugin[],
  fetchEffectGet: (uri: string) => Promise<unknown>,
): Promise<EffectPlugin[]> {
  const cache = new Map<string, Map<string, { minimum: number; maximum: number }>>();

  return Promise.all(
    plugins.map(async (plugin) => {
      const normalized = normalizePluginPorts(plugin);
      const needsRange = normalized.ports.some(
        (p) => p.minimum === undefined || p.maximum === undefined,
      );
      if (!needsRange || !plugin.uri) return normalized;

      let ranges = cache.get(plugin.uri);
      if (!ranges) {
        try {
          ranges = extractRangesFromEffectGet(await fetchEffectGet(plugin.uri));
        } catch {
          ranges = new Map();
        }
        cache.set(plugin.uri, ranges);
      }

      if (ranges.size === 0) return normalized;

      return {
        ...normalized,
        ports: normalized.ports.map((p) => {
          const r = ranges.get(p.symbol);
          if (!r) return p;
          return {
            ...p,
            minimum: p.minimum ?? r.minimum,
            maximum: p.maximum ?? r.maximum,
          };
        }),
      };
    }),
  );
}

export function portSliderMin(port: EffectPort): number {
  return port.minimum ?? 0;
}

export function portSliderMax(port: EffectPort): number {
  return port.maximum ?? 1;
}

export function portDisplayPercent(port: EffectPort): number {
  const lo = portSliderMin(port);
  const hi = portSliderMax(port);
  if (hi <= lo) return 0;
  return Math.round(((port.value - lo) / (hi - lo)) * 100);
}

export function portSliderStep(port: EffectPort): number {
  const span = portSliderMax(port) - portSliderMin(port);
  if (span <= 0) return 0.01;
  if (span <= 1) return span / 128;
  return span / 200;
}

export function formatPortValue(port: EffectPort): string {
  const v = port.value;
  if (Math.abs(v) >= 10 || Number.isInteger(v)) return String(Math.round(v * 100) / 100);
  return v.toFixed(2);
}

/** LV2 bypass/enable port (not host :bypass). CollisionDrive uses BYPASS=1 for effect on. */
export function findNativeBypassPort(plugin: EffectPlugin): string | null {
  const bypass = plugin.ports.find(
    (p) => /^bypass$/i.test(p.symbol) && !p.symbol.startsWith(":"),
  );
  if (bypass) return bypass.symbol;
  const enable = plugin.ports.find(
    (p) => /^enable$/i.test(p.symbol) && !p.symbol.startsWith(":"),
  );
  if (enable) return enable.symbol;
  return null;
}

export function nativeBypassValueForTarget(
  plugin: EffectPlugin,
  portSymbol: string,
  targetBypassed: boolean,
): number {
  const pt = plugin.ports.find((p) => p.symbol === portSymbol);
  return stompNativeValueForBypassed(
    portSymbol,
    targetBypassed,
    pt?.minimum ?? 0,
    pt?.maximum ?? 1,
  );
}

/** True if a WS param_set targets a plugin bypass/enable port. */
export function isNativeBypassPortSymbol(symbol: string): boolean {
  return /^bypass$/i.test(symbol) || /^enable$/i.test(symbol);
}

export function bypassedFromNativePortValue(
  _plugin: EffectPlugin,
  portSymbol: string,
  value: number,
): boolean {
  return stompNativeBypassed(portSymbol, value);
}
