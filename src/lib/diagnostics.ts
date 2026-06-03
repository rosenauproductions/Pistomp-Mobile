import * as modui from "../api/modui";
import type { EffectPlugin, PedalboardInfo } from "../api/types";
import { getAppVersionLabel } from "./appVersion";
import {
  getRuntimeMode,
  isModDesktopMode,
  isOnPiStompDevice,
  isPiStompMode,
} from "./runtimeMode";

export interface QaContext {
  mode: string;
  host: string;
  error: string | null;
  activeBundle: string;
  board: PedalboardInfo;
  hardwareInputAvailable: boolean;
}

function line(key: string, value: string | number | boolean | null | undefined): string {
  return `${key}: ${value ?? "(none)"}`;
}

function formatPlugin(p: EffectPlugin, i: number): string[] {
  const ports = p.ports
    .map((pt) => {
      const range =
        pt.minimum != null && pt.maximum != null
          ? ` [${pt.minimum}..${pt.maximum}]`
          : " [range missing — slider may be wrong]";
      return `${pt.symbol}=${pt.value}${range}`;
    })
    .join(", ");
  return [
    `  [${i}] instance="${p.instance}" title="${p.title ?? ""}" bypassed=${p.bypassed} uri=${p.uri ?? ""}`,
    `      ports: ${ports || "(none listed)"}`,
    `      hidden-stomp-dup ports: ${p.ports.filter((pt) => /^(gate|bypass|enable)$/i.test(pt.symbol)).map((x) => x.symbol).join(", ") || "none"}`,
  ];
}

export async function collectQaReport(ctx: QaContext): Promise<string> {
  const lines: string[] = [];
  const now = new Date().toISOString();

  lines.push("=== Pistomp-Mobile QA Report ===");
  lines.push(line("Generated", now));
  lines.push(line("App version", getAppVersionLabel()));
  lines.push(line("Page URL", typeof window !== "undefined" ? window.location.href : ""));
  lines.push(line("Hostname", typeof window !== "undefined" ? window.location.hostname : ""));
  lines.push(line("On Pi device URL", isOnPiStompDevice()));
  lines.push(line("Runtime mode (stored)", getRuntimeMode()));
  lines.push(line("isPiStompMode", isPiStompMode()));
  lines.push(line("isModDesktopMode", isModDesktopMode()));
  lines.push(line("Connection mode", ctx.mode));
  lines.push(line("Settings host (localStorage)", ctx.host || "(empty = same origin)"));
  lines.push(line("Last UI error", ctx.error));
  lines.push(line("Active pedalboard bundle", ctx.activeBundle));
  lines.push(line("Board title", ctx.board.title));
  lines.push(line("Plugin count", ctx.board.plugins.length));
  lines.push(line("Hardware ALSA API", ctx.hardwareInputAvailable ? "reachable" : "not reachable"));
  lines.push("");

  lines.push("--- Plugins (UI state) ---");
  ctx.board.plugins.forEach((p, i) => lines.push(...formatPlugin(p, i)));
  lines.push("");

  const collision =
    ctx.board.plugins.find((p) => /collision/i.test(p.instance + (p.title ?? ""))) ??
    ctx.board.plugins[0];

  lines.push("--- WebSocket ---");
  lines.push(modui.getWebSocketDiagnostics().join("\n"));
  lines.push("");
  lines.push("--- Recent API / control log ---");
  const log = modui.getControlLog();
  lines.push(log.length ? log.join("\n") : "  (empty — tap a stomp/slider then refresh QA)");
  lines.push("");

  lines.push("--- Live probes (run now) ---");
  const probes = await modui.runConnectionProbes(collision, {
    includePiStompHttpProbes: !isOnPiStompDevice(),
  });
  lines.push(probes.join("\n"));
  lines.push("");

  lines.push("--- Notes ---");
  lines.push(
    "  • Mac + phone won't mirror each other unless BOTH receive MOD WebSocket updates.",
  );
  lines.push(
    "  • Stomp sends host :bypass first, then native BYPASS/bypass/enable when present.",
  );
  lines.push(
    "  • QA probes do NOT call /reset/ (that endpoint clears all effects on the Pi).",
  );
  lines.push(
    "  • WiFi admin: Settings → Admin — requires install-on-pistomp.sh (/pistomp/wifi/).",
  );
  lines.push(
    "  • GATE on CollisionDrive is threshold (dB), not stomp; use BYPASS port for stomp in 0.2.2+.",
  );
  lines.push(
    "  • If HTTP set → true but WS null, deploy 0.2.2+ and re-run install-on-pistomp.sh for /websocket.",
  );
  lines.push(
    "  • If pi_stomp_set fails but WS ok, firmware MOD patch may be missing.",
  );
  lines.push("=== End QA Report ===");

  return lines.join("\n");
}
