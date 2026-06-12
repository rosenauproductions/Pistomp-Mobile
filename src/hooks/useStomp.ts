import { useCallback, useEffect, useState } from "react";
import * as demo from "../api/demo";
import * as modui from "../api/modui";
import {
  bypassedFromNativePortValue,
  findNativeBypassPort,
  isNativeBypassPortSymbol,
  nativeBypassValueForTarget,
} from "../api/portUtils";
import * as pistompAudio from "../api/pistompAudio";
import type { HardwareInputState } from "../api/pistompAudio";
import * as pistompWifi from "../api/pistompWifi";
import type { WifiStatus } from "../api/pistompWifi";
import { getShowHardwareInput, setShowHardwareInput as persistShowHardwareInput } from "../lib/adminPrefs";
import { collectQaReport } from "../lib/diagnostics";
import { EMPTY_PEDALBOARD } from "../lib/emptyBoard";
import {
  getRuntimeMode,
  isModDesktopMode,
  isOnPiStompDevice,
  isPiStompMode,
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

const deviceStartsOffline = typeof window !== "undefined" && isOnPiStompDevice();

export function useStomp() {
  const [mode, setMode] = useState<ConnectionMode>(deviceStartsOffline ? "offline" : "demo");
  const [host, setHostState] = useState(modui.getHost);
  const [pedalboards, setPedalboards] = useState<PedalboardSummary[]>(
    deviceStartsOffline ? [] : demo.DEMO_PEDALBOARDS,
  );
  const [activeBundle, setActiveBundle] = useState(
    deviceStartsOffline ? "" : demo.DEMO_PEDALBOARDS[0].bundle,
  );
  const [board, setBoard] = useState<PedalboardInfo>(
    deviceStartsOffline ? EMPTY_PEDALBOARD : demo.DEMO_BOARD,
  );
  const [snapshots, setSnapshots] = useState<SnapshotsMap>(demo.DEMO_SNAPSHOTS);
  const [activeSnapshot, setActiveSnapshot] = useState<string | null>("0");
  const [globals, setGlobals] = useState<GlobalControl[]>(demo.DEMO_GLOBALS);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimeMode, setRuntimeModeState] = useState<RuntimeMode>(getRuntimeMode);
  const [hardwareInput, setHardwareInput] = useState<HardwareInputState | null>(null);
  const [wifiAdminAvailable, setWifiAdminAvailable] = useState(false);
  const [showHardwareInput, setShowHardwareInputState] = useState(getShowHardwareInput);
  const [wsConnected, setWsConnected] = useState(false);
  const [connectAttempted, setConnectAttempted] = useState(false);
  const [modReachable, setModReachable] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [wifiStatus, setWifiStatus] = useState<WifiStatus | null>(null);

  const markDirty = useCallback(() => setDirty(true), []);

  const refreshHardwareInput = useCallback(async (controlName?: string) => {
    const state = await pistompAudio.loadHardwareInputState(controlName);
    setHardwareInput(state);
  }, []);

  const refreshWifiStatus = useCallback(async (): Promise<WifiStatus | null> => {
    const status = await pistompWifi.fetchWifiStatus();
    setWifiStatus(status);
    setWifiAdminAvailable(status != null);
    return status;
  }, []);

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
      if (opts?.replacePlugins && info.plugins.length === 0) {
        throw new Error(
          "MOD returned no effects yet — wait a moment and tap Change pedalboard again",
        );
      }
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
    setBusyMessage("Connecting to MOD…");
    setConnectAttempted(true);
    try {
      if (modui.fixHostForCurrentOrigin()) {
        setHostState("");
      }
      await modui.testConnection();
      setModReachable(true);
      setMode("live");
      modui.warmWebSocketForLiveSession();
      const list = await modui.listPedalboards();
      setPedalboards(list);
      const loadable = list.filter((p) => !p.broken);
      const current = await modui.getCurrentPedalboardBundle();
      const initial =
        (current && current.length > 0 ? current : null) ??
        (loadable.find((p) => p.bundle === activeBundle)?.bundle ?? loadable[0]?.bundle);
      if (initial) {
        const pbTitle = list.find((p) => p.bundle === initial)?.title ?? "pedalboard";
        setActiveBundle(initial);
        if (isPiStompMode()) {
          setBusyMessage(`Syncing ${pbTitle}…`);
          const wsOk = await modui.ensureWebSocketReady();
          if (!wsOk) {
            setError(
              "WebSocket to MOD failed — stomps need WS (HTTP pi_stomp_set may be unavailable on this image). Re-run install-on-pistomp.sh if /websocket fails.",
            );
          }
          const alreadyLive = await modui.hostReportsPedalboardLoaded(initial);
          if (alreadyLive) {
            modui.pushControlLog(`connect: MOD already on ${initial} (no reset/load)`);
          } else {
            modui.pushControlLog(
              `connect: mirror UI only — use Change pedalboard to load into MOD if stomps are dead`,
            );
          }
        }
        try {
          await refreshBoard(initial, true, { replacePlugins: true });
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Could not refresh pedalboard from MOD",
          );
        }
      }
      setDirty(false);
      await refreshWifiStatus();
    } catch (e) {
      setModReachable(false);
      if (isOnPiStompDevice()) {
        setMode("offline");
        setPedalboards([]);
        setBoard(EMPTY_PEDALBOARD);
        setGlobals([]);
        setSnapshots({});
        setHardwareInput(null);
        setWifiAdminAvailable(false);
        setWifiStatus(null);
      } else {
        setMode("demo");
        setPedalboards(demo.DEMO_PEDALBOARDS);
        setBoard(demo.DEMO_BOARD);
        setGlobals(demo.DEMO_GLOBALS);
        setSnapshots(demo.DEMO_SNAPSHOTS);
        setHardwareInput(null);
        setWifiAdminAvailable(false);
      }
      setError(e instanceof Error ? e.message : "Cannot reach Pi-Stomp");
    } finally {
      setBusy(false);
      setBusyMessage(null);
    }
  }, [activeBundle, refreshBoard, refreshHardwareInput, refreshWifiStatus]);

  useEffect(() => {
    void connect();
  }, []);

  useEffect(() => {
    if (mode !== "live") {
      setWsConnected(false);
      return;
    }
    return modui.onWebSocketStatus(setWsConnected);
  }, [mode]);

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
        setBoard((prev) => {
          const plugins = modui.applyInboundBypass(prev.plugins, ev.instance, ev.bypassed);
          return plugins ? { ...prev, plugins } : prev;
        });
        return;
      }
      if (ev?.kind === "param") {
        setBoard((prev) => ({
          ...prev,
          plugins: prev.plugins.map((p) => {
            if (!modui.instanceIdsMatch(p.instance, ev.instance)) return p;
            const ports = p.ports.map((pt) =>
              pt.symbol === ev.port ? { ...pt, value: ev.value } : pt,
            );
            const withPorts = { ...p, ports };
            const bypassed = isNativeBypassPortSymbol(ev.port)
              ? bypassedFromNativePortValue(withPorts, ev.port, ev.value)
              : p.bypassed;
            return { ...withPorts, bypassed };
          }),
        }));
        setGlobals((prev) =>
          prev.map((g) =>
            modui.instanceIdsMatch(g.instance, ev.instance) && g.port === ev.port
              ? { ...g, value: ev.value }
              : g,
          ),
        );
        return;
      }
      if (modui.shouldReloadBoardFromWs(msg)) {
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
    if (pb.broken) {
      setError(`${pb.title} is broken on this Pi (missing plugins).`);
      return;
    }
    if (mode === "offline") {
      setError("Not connected — tap ↻ Reconnect first.");
      return;
    }
    setBusy(true);
    setBusyMessage(`Loading ${pb.title}…`);
    setError(null);
    setBoard((prev) => ({ ...prev, title: pb.title }));
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
      if (mode === "live" && activeBundle) {
        await refreshBoard(activeBundle, true, { replacePlugins: true });
      }
    } finally {
      setBusy(false);
      setBusyMessage(null);
    }
  };

  const toggleBypass = async (plugin: EffectPlugin) => {
    const next = !plugin.bypassed;
    setBoard((prev) => ({
      ...prev,
      plugins: prev.plugins.map((p) =>
        modui.instanceIdsMatch(p.instance, plugin.instance) ? { ...p, bypassed: next } : p,
      ),
    }));
    markDirty();
    if (mode === "live") {
      const ok = await modui.setPluginBypass(plugin, next);
      if (ok) {
        setBoard((prev) => ({
          ...prev,
          plugins: prev.plugins.map((p) => {
            if (!modui.instanceIdsMatch(p.instance, plugin.instance)) return p;
            const sym = findNativeBypassPort(p);
            const ports = sym
              ? p.ports.map((pt) =>
                  pt.symbol === sym
                    ? { ...pt, value: nativeBypassValueForTarget(p, sym, next) }
                    : pt,
                )
              : p.ports;
            return { ...p, bypassed: next, ports };
          }),
        }));
      }
      if (!ok) {
        setBoard((prev) => ({
          ...prev,
          plugins: prev.plugins.map((p) =>
            modui.instanceIdsMatch(p.instance, plugin.instance)
              ? { ...p, bypassed: !next }
              : p,
          ),
        }));
        setError(
          "Bypass failed — tap Change pedalboard, pick the same board again, then retry",
        );
      }
    }
  };

  const setEffectParameter = async (instance: string, port: string, value: number) => {
    const prevPort = board.plugins
      .find((p) => p.instance === instance)
      ?.ports.find((pt) => pt.symbol === port)?.value;
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
        if (prevPort !== undefined) {
          setBoard((prev) => ({
            ...prev,
            plugins: prev.plugins.map((p) =>
              p.instance === instance
                ? {
                    ...p,
                    ports: p.ports.map((pt) =>
                      pt.symbol === port ? { ...pt, value: prevPort } : pt,
                    ),
                  }
                : p,
            ),
          }));
        }
        setError(
          "Parameter failed — tap Change pedalboard, reload the same board, then retry",
        );
      }
    }
  };

  const setHardwareInputValue = async (value: number) => {
    if (!hardwareInput) return;
    const prev = hardwareInput.value;
    setHardwareInput((s) => (s ? { ...s, value } : s));
    const ok = await pistompAudio.setAlsaValue(hardwareInput.control, value);
    if (!ok) {
      setHardwareInput((s) => (s ? { ...s, value: prev } : s));
      setError("Hardware volume failed — re-run install-on-pistomp.sh on the Pi");
    }
  };

  const setHardwareInputControl = async (controlName: string) => {
    pistompAudio.setStoredAlsaControl(controlName);
    await refreshHardwareInput(controlName);
  };

  const reloadActivePedalboard = async () => {
    if (mode !== "live" || !activeBundle) {
      setError("Connect in LIVE mode with a pedalboard selected first.");
      return;
    }
    setBusy(true);
    setBusyMessage("Reloading pedalboard into MOD…");
    setError(null);
    try {
      const ok = await modui.syncHostPedalboard(activeBundle);
      if (!ok) throw new Error("Could not load pedalboard into MOD");
      await refreshBoard(activeBundle, true, { replacePlugins: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reload failed");
    } finally {
      setBusy(false);
      setBusyMessage(null);
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

  const setShowHardwareInput = useCallback((visible: boolean) => {
    persistShowHardwareInput(visible);
    setShowHardwareInputState(visible);
  }, []);

  const saveRuntimeMode = (next: RuntimeMode) => {
    setRuntimeMode(next);
    setRuntimeModeState(next);
    modui.resetWebSocketConnection();
    void connect();
  };

  const getPlugin = (instance: string): EffectPlugin | undefined =>
    board.plugins.find((p) => p.instance === instance);

  const activeCount = board.plugins.filter((p) => !p.bypassed).length;
  const connectionBroken =
    mode === "offline" ||
    (mode === "live" && connectAttempted && !busy && !wsConnected);
  const boardEmptyWarning =
    mode === "live" && board.plugins.length === 0 && connectAttempted && !busy;

  const connectionStatusLine = (() => {
    if (mode === "offline") return "MOD unreachable — tap ↻ to reconnect";
    if (mode === "demo") return "Demo mode (not connected to Pi)";
    if (!modReachable) return "Connecting…";
    const parts = ["MOD OK"];
    parts.push(wsConnected ? "WS connected" : "WS down (stomps may not work)");
    if (board.plugins.length > 0) {
      parts.push(`${board.plugins.length} effects`);
    }
    return parts.join(" · ");
  })();

  const collectQa = useCallback(
    () =>
      collectQaReport({
        mode,
        host,
        error,
        activeBundle,
        board,
        hardwareInputAvailable: hardwareInput?.available ?? false,
      }),
    [mode, host, error, activeBundle, board, hardwareInput?.available],
  );

  return {
    mode,
    host,
    pedalboards,
    activeBundle,
    board,
    snapshots,
    activeSnapshot,
    globals,
    hardwareInput,
    wifiAdminAvailable,
    refreshWifiStatus,
    refreshHardwareInput,
    reloadActivePedalboard,
    showHardwareInput,
    setShowHardwareInput,
    dirty,
    busy,
    error,
    activeCount,
    connectionBroken,
    connectionStatusLine,
    boardEmptyWarning,
    busyMessage,
    wifiStatus,
    modReachable,
    connect,
    selectPedalboard,
    toggleBypass,
    setEffectParameter,
    loadSnapshot,
    setGlobalValue,
    setHardwareInputValue,
    setHardwareInputControl,
    saveChanges,
    saveHost,
    saveRuntimeMode,
    runtimeMode,
    getPlugin,
    collectQa,
    clearError: () => setError(null),
  };
}
