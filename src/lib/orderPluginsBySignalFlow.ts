import type { EffectPlugin, PedalboardConnection } from "../api/types";

type Endpoint =
  | { kind: "capture" }
  | { kind: "playback" }
  | { kind: "plugin"; instance: string };

function parseEndpoint(endpoint: string): Endpoint {
  const ep = endpoint.trim();
  if (/^capture/i.test(ep)) return { kind: "capture" };
  if (/^playback/i.test(ep) || /^system:/i.test(ep) || /^mod-host:/i.test(ep)) {
    return { kind: "playback" };
  }
  const slash = ep.indexOf("/");
  const instance = slash === -1 ? ep : ep.slice(0, slash);
  return { kind: "plugin", instance };
}

function isAudioConnection(conn: PedalboardConnection): boolean {
  if (conn.valid === false) return false;
  const hay = `${conn.source} ${conn.target}`.toLowerCase();
  if (hay.includes("midi")) return false;
  if (hay.includes("/cv") || hay.includes(":cv")) return false;
  return true;
}

function compareLayout(a: EffectPlugin, b: EffectPlugin): number {
  const ax = a.x ?? 0;
  const bx = b.x ?? 0;
  if (ax !== bx) return ax - bx;
  const ay = a.y ?? 0;
  const by = b.y ?? 0;
  if (ay !== by) return ay - by;
  return a.instance.localeCompare(b.instance);
}

function sortByLayout(plugins: EffectPlugin[]): EffectPlugin[] {
  return [...plugins].sort(compareLayout);
}

/**
 * Order stomp grid left-to-right / top-to-bottom by MOD signal flow when possible.
 * Uses `connections` for graph order; ties and fallbacks use plugin `x`/`y` from MOD.
 */
export function orderPluginsBySignalFlow(
  plugins: EffectPlugin[],
  connections: PedalboardConnection[] = [],
): EffectPlugin[] {
  if (plugins.length <= 1) return [...plugins];

  const byInstance = new Map(plugins.map((p) => [p.instance, p]));
  const layoutOrder = () => sortByLayout(plugins);

  const audio = connections.filter(isAudioConnection);
  if (audio.length === 0) return layoutOrder();

  const instances = new Set(plugins.map((p) => p.instance));
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, Set<string>>();

  for (const inst of instances) {
    inDegree.set(inst, 0);
    outEdges.set(inst, new Set());
  }

  for (const conn of audio) {
    const src = parseEndpoint(conn.source);
    const tgt = parseEndpoint(conn.target);
    if (tgt.kind !== "plugin" || !instances.has(tgt.instance)) continue;

    if (src.kind === "capture") continue;

    if (src.kind !== "plugin" || !instances.has(src.instance)) continue;
    if (src.instance === tgt.instance) continue;

    const from = src.instance;
    const to = tgt.instance;
    const outs = outEdges.get(from)!;
    if (!outs.has(to)) {
      outs.add(to);
      inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
    }
  }

  let frontier = sortByLayout(
    [...instances]
      .filter((inst) => (inDegree.get(inst) ?? 0) === 0)
      .map((inst) => byInstance.get(inst)!),
  );

  const ordered: EffectPlugin[] = [];
  const placed = new Set<string>();

  while (frontier.length > 0) {
    const nextFrontier: EffectPlugin[] = [];

    for (const plugin of frontier) {
      if (placed.has(plugin.instance)) continue;
      placed.add(plugin.instance);
      ordered.push(plugin);

      for (const to of outEdges.get(plugin.instance) ?? []) {
        if (placed.has(to)) continue;
        const deg = (inDegree.get(to) ?? 0) - 1;
        inDegree.set(to, deg);
        if (deg <= 0) {
          const target = byInstance.get(to);
          if (target) nextFrontier.push(target);
        }
      }
    }

    frontier = sortByLayout(nextFrontier);
  }

  const remaining = plugins.filter((p) => !placed.has(p.instance));
  if (remaining.length > 0) {
    ordered.push(...sortByLayout(remaining));
  }

  return ordered;
}
