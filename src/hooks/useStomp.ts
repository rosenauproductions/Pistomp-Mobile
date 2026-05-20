import { useCallback, useEffect, useState } from "react";
import * as demo from "../api/demo";
import * as modui from "../api/modui";
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

  const markDirty = useCallback(() => setDirty(true), []);

  const refreshBoard = useCallback(
    async (bundle: string, live: boolean) => {
      if (!live) {
        setBoard(demo.DEMO_BOARD);
        setGlobals(demo.DEMO_GLOBALS);
        setSnapshots(demo.DEMO_SNAPSHOTS);
        return;
      }
      const info = await modui.getLivePedalboardInfo(bundle);
      setBoard(info);
      setGlobals(modui.extractGlobalControls(info.plugins));
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
      const list = await modui.listPedalboards();
      setPedalboards(list.filter((p) => !p.broken));
      if (list.length > 0 && !list.some((p) => p.bundle === activeBundle)) {
        setActiveBundle(list[0].bundle);
        await refreshBoard(list[0].bundle, true);
      } else if (activeBundle) {
        await refreshBoard(activeBundle, true);
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
    const onRemoteChange = () => {
      if (activeBundle) void refreshBoard(activeBundle, true);
    };
    const stopWs = modui.connectWebSocket((msg) => {
      if (
        msg.startsWith("param_set") ||
        msg.includes("load-pb") ||
        msg.includes("snapshot") ||
        msg.includes("pedalboard")
      ) {
        onRemoteChange();
      }
    });
    const poll = window.setInterval(onRemoteChange, 2500);
    return () => {
      stopWs();
      window.clearInterval(poll);
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
        await refreshBoard(pb.bundle, true);
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
        setError("Bypass update failed");
      } else if (activeBundle) {
        void refreshBoard(activeBundle, true);
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
      await modui.setParameter(instance, port, value);
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
      await modui.setParameter(ctrl.instance, ctrl.port, value);
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
    getPlugin,
    clearError: () => setError(null),
  };
}
