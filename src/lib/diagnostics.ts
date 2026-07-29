import * as modui from "../api/modui";
import type { EffectPlugin, PedalboardInfo } from "../api/types";
import { getAppVersionLabel, getBuildId } from "./appVersion";
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

function collectClientCacheLines(): string[] {
  const lines: string[] = [];
  if (typeof document === "undefined") {
    lines.push("  (no document)");
    return lines;
  }

  const scripts = [...document.querySelectorAll("script[src]")]
    .map((el) => (el as HTMLScriptElement).src)
    .filter(Boolean);
  const styles = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map((el) => (el as HTMLLinkElement).href)
    .filter(Boolean);

  lines.push(line("  Build id (compiled)", getBuildId()));
  lines.push(line("  document.URL", document.URL));
  lines.push(line("  location.href", window.location.href));
  lines.push(
    line(
      "  JS bundles",
      scripts.map((s) => s.split("/").pop()).join(", ") || "(none)",
    ),
  );
  lines.push(
    line(
      "  CSS bundles",
      styles.map((s) => s.split("/").pop()).join(", ") || "(none)",
    ),
  );
  lines.push(line("  navigator.onLine", navigator.onLine));
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string } })
    .connection;
  lines.push(line("  network effectiveType", conn?.effectiveType ?? "(n/a)"));
  lines.push(
    line(
      "  serviceWorker controller",
      navigator.serviceWorker?.controller ? "active (may cache)" : "none",
    ),
  );
  lines.push(
    line(
      "  Cache Storage API",
      typeof caches !== "undefined" ? "available" : "unavailable",
    ),
  );
  return lines;
}

async function collectCacheProbeLines(): Promise<string[]> {
  const lines: string[] = ["--- Client / cache ---", ...collectClientCacheLines()];
  try {
    const res = await fetch(`/index.html?qa=${Date.now()}`, { cache: "no-store" });
    const text = await res.text();
    const assetMatch = text.match(/assets\/index-[^"'\\s]+/g) ?? [];
    lines.push(line("  GET /index.html (no-store)", `HTTP ${res.status}`));
    lines.push(
      line(
        "  Cache-Control",
        res.headers.get("cache-control") ?? "(none)",
      ),
    );
    lines.push(
      line(
        "  Assets in index.html",
        assetMatch.join(", ") || "(none found)",
      ),
    );
    const liveJs = collectClientCacheLines()
      .find((l) => l.includes("JS bundles"))
      ?.split(": ")[1];
    const htmlJs = assetMatch.find((a) => a.endsWith(".js"))?.split("/").pop();
    if (liveJs && htmlJs && !liveJs.includes(htmlJs)) {
      lines.push(
        `  ⚠ CACHE MISMATCH: page is running "${liveJs}" but index.html lists "${htmlJs}" — hard-refresh / clear site data.`,
      );
    } else if (htmlJs) {
      lines.push(`  Bundle match check: ok (${htmlJs})`);
    }
  } catch (e) {
    lines.push(`  GET /index.html → ERROR ${e instanceof Error ? e.message : String(e)}`);
  }
  return lines;
}

async function collectShutdownQaLines(): Promise<string[]> {
  const lines: string[] = ["--- Shutdown / system API ---"];
  if (!isPiStompMode()) {
    lines.push("  (skipped — not Pi-Stomp runtime mode)");
    return lines;
  }

  lines.push(await modui.fetchProbe("/pistomp/wifi/capabilities"));
  lines.push(await modui.fetchProbe("/pistomp/wifi/diagnostics"));
  lines.push(await modui.fetchProbe("/pistomp/wifi/poweroff-log"));

  try {
    const res = await fetch("/pistomp/wifi/shutdown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
      cache: "no-store",
    });
    const text = (await res.text()).trim();
    lines.push(`  POST /pistomp/wifi/shutdown dryRun=true → HTTP ${res.status}`);
    lines.push(`  ${text.slice(0, 1200)}`);
  } catch (e) {
    lines.push(
      `  POST /pistomp/wifi/shutdown dryRun → ERROR ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  try {
    const res = await fetch("/pistomp/wifi/reboot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
      cache: "no-store",
    });
    const text = (await res.text()).trim();
    lines.push(`  POST /pistomp/wifi/reboot dryRun=true → HTTP ${res.status} ${text.slice(0, 400)}`);
  } catch (e) {
    lines.push(
      `  POST /pistomp/wifi/reboot dryRun → ERROR ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return lines;
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

  lines.push(...(await collectCacheProbeLines()));
  lines.push("");
  lines.push(...(await collectShutdownQaLines()));
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
    "  • If Bundle match check fails, the phone is on a cached JS build — hard-refresh or clear site data.",
  );
  lines.push(
    "  • Shutdown dryRun must show unitLoaded:true. If missing, run update-pistomp-mobile.sh on the Pi.",
  );
  lines.push(
    "  • Safe to power off in the app = HTTP to the Pi stopped responding (LCD uses white splash).",
  );
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
