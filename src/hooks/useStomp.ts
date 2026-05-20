import { useCallback, useEffect, useState } from "react";
import * as demo from "../api/demo";
import * as modui from "../api/modui";
import {
  getRuntimeMode,
  isModDesktopMode,
  setRuntimeMode,
  type RuntimeMode,
} from "../lib/runtimeMode";
import type {
  ConnectionMode,
  EffectPlugin,
  GlobalControl,
  PedalboardInfo,
  PedalboardSummary,
  SnapshotsMap,
} from "../api/types";

export function useStomp() {
  const [mode, setMode] = useState<ConnectionMode>("demo");
  const [host, setHostState] = useState(modui.getHost);
  const [pedalboards, setPedalboards] = useState<PedalboardSummary[]>(demo.DEMO_PEDALBOARDS);
  const [activeBundle, setActiveBundle] = useState(demo.DEMO_PEDALBOARDS[0].bundle);
  const [board, setBoard] = useState<PedalboardInfo>(demo.DEMO_BOARD);
  const [snapshots, setSnapshots] = useState<SnapshotsMap>(demo.DEMO_SNAPSHOTS);
  const [activeSnapshot, setActiveSnapshot] = useState<string | null>("0");
  const [globals, setGlobals] = useState<GlobalControl[]>(demo.DEMO_GLOBALS);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimeMode, setRuntimeModeState] = useState<RuntimeMode>(getRuntimeMode);

  const markDirty = useCallback(() => setDirty(true), []);

  const refreshBoard = useCallback(
    async (bundle: string, live: boolean, opts?: { replacePlugins?: boolean }) => {
      if (!live) {
        setBoard(demo.DEMO_BOARD);
        setGlobals(demo.DEMO_GLOBALS);
        setSnapshots(demo.DEMO_SNAPSHOTS);
        return;
      }
      const { bundle: resolved, info } = await modui.getLivePedalboardState(bundle);
      setActiveBundle(resolved);
      setBoard((prev) => {
        const plugins = modui.applyPluginsAfterRefresh(prev.plugins, info.plugins, {
          replace: opts?.replacePlugins,
        });
        setGlobals(modui.extractGlobalControls(plugins));
        return { ...info, plugins };
      });
      try {
        const snaps = await modui.listSnapshots();
        setSnapshots(snaps);
      } catch {
        setSnapshots({});
      }
    },
    [],
  );

  const connect = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      if (modui.fixHostForCurrentOrigin()) {
        setHostState("");
      }
      await modui.testConnection();
      setMode("live");
      modui.warmWebSocketForLiveSession();
      const list = await modui.listPedalboards().then((pbs) => pbs.filter((p) => !p.broken));
      setPedalboards(list);
      const current = await modui.getCurrentPedalboardBundle();
      const initial =
        current ??
        (list.find((p) => p.bundle === activeBundle)?.bundle ?? list[0]?.bundle);
      if (initial) {
        setActiveBundle(initial);
        await refreshBoard(initial, true);
      }
      setDirty(false);
    } catch (e) {
      setMode("demo");
      setPedalboards(demo.DEMO_PEDALBOARDS);
      setBoard(demo.DEMO_BOARD);
      setGlobals(demo.DEMO_GLOBALS);
      setSnapshots(demo.DEMO_SNAPSHOTS);
      setError(e instanceof Error ? e.message : "Cannot reach Pi-Stomp");
    } finally {
      setBusy(false);
    }
  }, [activeBundle, refreshBoard]);

  useEffect(() => {
    void connect();
  }, []);

  useEffect(() => {
    if (mode !== "live") return;
    const onPedalboardReload = () => {
      if (activeBundle) void refreshBoard(activeBundle, true, { replacePlugins: true });
    };
    const onDesktopPoll = () => {
      if (activeBundle) void refreshBoard(activeBundle, true);
    };
    const stopWs = modui.connectWebSocket((msg) => {
      const ev = modui.parseParamSetWsMessage(msg);
      if (ev?.kind === "bypass") {
        setBoard((prev) => ({
          ...prev,
          plugins: prev.plugins.map((p) =>
            p.instance === ev.instance ? { ...p, bypassed: ev.bypassed } : p,
          ),
        }));
        return;
      }
      if (ev?.kind === "param") {
        setBoard((prev) => ({
          ...prev,
          plugins: prev.plugins.map((p) =>
            p.instance === ev.instance
              ? {
                  ...p,
                  ports: p.ports.map((pt) =>
                    pt.symbol === ev.port ? { ...pt, value: ev.value } : pt,
                  ),
                }
              : p,
          ),
        }));
        setGlobals((prev) =>
          prev.map((g) =>
            g.instance === ev.instance && g.port === ev.port ? { ...g, value: ev.value } : g,
          ),
        );
        return;
      }
      if (
        msg.includes("load-pb") ||
        msg.includes("snapshot") ||
        msg.includes("pedalboard")
      ) {
        onPedalboardReload();
      }
    });
    const pollMs = 8000;
    const poll = isModDesktopMode()
      ? window.setInterval(onDesktopPoll, pollMs)
      : undefined;
    return () => {
      stopWs();
      if (poll !== undefined) window.clearInterval(poll);
    };
  }, [mode, activeBundle, refreshBoard]);

  const selectPedalboard = async (pb: PedalboardSummary) => {
    setBusy(true);
    setError(null);
    setBoard((prev) => ({ ...prev, title: pb.title, plugins: [] }));
    try {
      if (mode === "live") {
        const ok = await modui.loadPedalboard(pb.bundle);
        if (!ok) throw new Error("Failed to load pedalboard");
        setActiveBundle(pb.bundle);
        await refreshBoard(pb.bundle, true, { replacePlugins: true });
      } else {
        setBoard({ ...demo.DEMO_BOARD, title: pb.title });
      }
      if (mode !== "live") setActiveBundle(pb.bundle);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      if (mode === "live" && activeBundle) await refreshBoard(activeBundle, true);
    } finally {
      setBusy(false);
    }
  };

  const toggleBypass = async (plugin: EffectPlugin) => {
    const next = !plugin.bypassed;
    setBoard((prev) => ({
      ...prev,
      plugins: prev.plugins.map((p) =>
        p.instance === plugin.instance ? { ...p, bypassed: next } : p,
      ),
    }));
    markDirty();
    if (mode === "live") {
      const ok = await modui.setBypass(plugin.instance, next);
      if (!ok) {
        setBoard((prev) => ({
          ...prev,
          plugins: prev.plugins.map((p) =>
            p.instance === plugin.instance ? { ...p, bypassed: !next } : p,
          ),
        }));
        setError("Bypass failed — could not reach MOD on the Pi (reload page; check :8080 proxy)");
      }
    }
  };

  const setEffectParameter = async (instance: string, port: string, value: number) => {
    setBoard((prev) => ({
      ...prev,
      plugins: prev.plugins.map((p) =>
        p.instance === instance
          ? {
              ...p,
              ports: p.ports.map((pt) => (pt.symbol === port ? { ...pt, value } : pt)),
            }
          : p,
      ),
    }));
    setGlobals((prev) =>
      prev.map((g) => (g.instance === instance && g.port === port ? { ...g, value } : g)),
    );
    markDirty();
    if (mode === "live") {
      const ok = await modui.setParameter(instance, port, value);
      if (!ok) {
        setError("Parameter update failed — could not reach MOD on the Pi");
      }
    }
  };

  const loadSnapshot = async (id: string) => {
    setActiveSnapshot(id);
    if (mode === "demo") return;
    setBusy(true);
    try {
      const ok = await modui.loadSnapshot(Number(id));
      if (!ok) throw new Error("Snapshot load failed");
      if (activeBundle) await refreshBoard(activeBundle, true);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Snapshot failed");
    } finally {
      setBusy(false);
    }
  };

  const setGlobalValue = async (ctrl: GlobalControl, value: number) => {
    setGlobals((prev) =>
      prev.map((g) => (g.kind === ctrl.kind ? { ...g, value } : g)),
    );
    setBoard((prev) => ({
      ...prev,
      plugins: prev.plugins.map((p) =>
        p.instance === ctrl.instance
          ? {
              ...p,
              ports: p.ports.map((pt) => (pt.symbol === ctrl.port ? { ...pt, value } : pt)),
            }
          : p,
      ),
    }));
    markDirty();
    if (mode === "live") {
      const ok = await modui.setParameter(ctrl.instance, ctrl.port, value);
      if (!ok) {
        setError("Parameter update failed — could not reach MOD on the Pi");
      }
    }
  };

  const saveChanges = async () => {
    if (mode === "demo") {
      setDirty(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ok = await modui.savePedalboard(board.title, false);
      if (!ok) throw new Error("Could not save pedalboard");
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const saveHost = (next: string) => {
    modui.setHost(next);
    setHostState(next);
    void connect();
  };

  const saveRuntimeMode = (next: RuntimeMode) => {
    setRuntimeMode(next);
    setRuntimeModeState(next);
    modui.resetWebSocketConnection();
    void connect();
  };

  const getPlugin = (instance: string): EffectPlugin | undefined =>
    board.plugins.find((p) => p.instance === instance);

  const activeCount = board.plugins.filter((p) => !p.bypassed).length;

  return {
    mode,
    host,
    pedalboards,
    activeBundle,
    board,
    snapshots,
    activeSnapshot,
    globals,
    dirty,
    busy,
    error,
    activeCount,
    connect,
    selectPedalboard,
    toggleBypass,
    setEffectParameter,
    loadSnapshot,
    setGlobalValue,
    saveChanges,
    saveHost,
    saveRuntimeMode,
    runtimeMode,
    getPlugin,
    clearError: () => setError(null),
  };
}
