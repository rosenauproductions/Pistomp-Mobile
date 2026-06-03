import * as modui from "../api/modui";

export interface HealthCheckRow {
  name: string;
  ok: boolean;
  detail: string;
}

async function probe(
  name: string,
  path: string,
  okWhen: (status: number, body: string) => boolean,
): Promise<HealthCheckRow> {
  try {
    const res = await fetch(path, { signal: AbortSignal.timeout(5000) });
    const body = (await res.text()).trim().replace(/\s+/g, " ").slice(0, 120);
    const ok = okWhen(res.status, body);
    return { name, ok, detail: `HTTP ${res.status} ${body || "(empty)"}` };
  } catch (e) {
    return {
      name,
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Read-only install checks (does not call /reset/ — that clears MOD effects). */
export async function runInstallHealthCheck(): Promise<HealthCheckRow[]> {
  const rows: HealthCheckRow[] = [];

  rows.push(
    await probe("MOD pedalboard list", "/pedalboard/list", (s, b) => s === 200 && b.startsWith("[")),
  );
  rows.push(
    await probe(
      "pistomp-last.json",
      "/pistomp-last.json",
      (s, b) => s === 200 && (b.startsWith("{") || b === "{}"),
    ),
  );
  rows.push(
    await probe(
      "Hardware audio API",
      "/pistomp/audio/controls",
      (s, b) => s === 200 && b.includes("controls"),
    ),
  );
  rows.push(
    await probe(
      "WiFi admin API",
      "/pistomp/wifi/status",
      (s, b) => s === 200 && b.includes("hotspotActive"),
    ),
  );

  const wsOpen = modui.isWebSocketOpen();
  rows.push({
    name: "MOD WebSocket (live)",
    ok: wsOpen,
    detail: wsOpen ? "OPEN — stomps use WebSocket" : "Not open — tap Reconnect or toggle a stomp",
  });

  return rows;
}
