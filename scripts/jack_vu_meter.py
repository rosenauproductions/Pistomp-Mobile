#!/usr/bin/env python3
"""Non-invasive JACK peak tap for Pistomp-Mobile VU meters.

Registers a passive JACK client (input ports only) and fans out from existing
capture / monitor ports. Does not alter the pedalboard graph beyond optional
extra connections FROM ports that already feed audio (JACK allows multiple
readers).

Lives entirely under pistomp-mobile; uses libjack via ctypes (no extra apt pkgs).
"""
from __future__ import annotations

import ctypes
import ctypes.util
import logging
import math
import os
import threading
import time

log = logging.getLogger("jack_vu_meter")

# Prefer Pi-Stomp promiscuous JACK (mod-host / jackdrc use this).
os.environ.setdefault("JACK_PROMISCUOUS_SERVER", "jack")

JackClient = ctypes.c_void_p
JackPort = ctypes.c_void_p
jack_nframes_t = ctypes.c_uint32
jack_default_audio_sample_t = ctypes.c_float

JackProcessCallback = ctypes.CFUNCTYPE(ctypes.c_int, jack_nframes_t, ctypes.c_void_p)

JackPortIsInput = 0x1
JackPortIsOutput = 0x2
JackNoStartServer = 0x01

def _load_jack():
    path = ctypes.util.find_library("jack") or "libjack.so.0"
    return ctypes.CDLL(path)


class JackVuMeter:
    """Background JACK peak meter; thread-safe peak readouts (0..1)."""

    def __init__(self, client_name: str = "pistomp-mobile-vu") -> None:
        self.client_name = client_name
        self._lock = threading.Lock()
        self._peaks = [0.0, 0.0, 0.0, 0.0]  # inL inR outL outR linear abs
        self._held = [0.0, 0.0, 0.0, 0.0]
        self._available = False
        self._error: str | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._client: JackClient | None = None
        self._ports: list = []
        self._jack = None
        self._process_cb = None  # keep callback alive

    @property
    def available(self) -> bool:
        return self._available

    @property
    def error(self) -> str | None:
        return self._error

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="jack-vu", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2.0)
            self._thread = None
        self._shutdown_client()

    def snapshot(self) -> dict:
        """Return normalized 0..1 peaks with slow release for UI."""
        with self._lock:
            lin = list(self._peaks)
            # Clear instantaneous peaks after read; held values decay below.
            self._peaks = [0.0, 0.0, 0.0, 0.0]
            held = list(self._held)
            available = self._available
            err = self._error

        now = time.monotonic()
        # Apply release toward latest lin (instant attack).
        for i in range(4):
            if lin[i] >= held[i]:
                held[i] = lin[i]
            else:
                held[i] *= 0.82  # ~ release per poll (~15 Hz → musical decay)
                if held[i] < 1e-5:
                    held[i] = 0.0

        with self._lock:
            self._held = held

        def to_norm(x: float) -> float:
            if x <= 0:
                return 0.0
            db = 20.0 * math.log10(x)
            # Map -50 dBFS .. 0 dBFS → 0..1 (guitar / pedalboard friendly)
            return max(0.0, min(1.0, (db + 50.0) / 50.0))

        return {
            "available": available,
            "error": err,
            "inL": round(to_norm(held[0]), 4),
            "inR": round(to_norm(held[1]), 4),
            "outL": round(to_norm(held[2]), 4),
            "outR": round(to_norm(held[3]), 4),
            "ts": now,
        }

    def _shutdown_client(self) -> None:
        if self._jack and self._client:
            try:
                self._jack.jack_deactivate(self._client)
            except Exception:
                pass
            try:
                self._jack.jack_client_close(self._client)
            except Exception:
                pass
        self._client = None
        self._ports = []
        with self._lock:
            self._available = False

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self._session()
            except Exception as exc:
                with self._lock:
                    self._available = False
                    self._error = str(exc)
                log.warning("jack vu session ended: %s", exc)
            self._shutdown_client()
            if self._stop.wait(2.0):
                break

    def _session(self) -> None:
        jack = _load_jack()
        self._jack = jack

        jack.jack_client_open.restype = JackClient
        jack.jack_client_open.argtypes = [
            ctypes.c_char_p,
            ctypes.c_uint32,
            ctypes.POINTER(ctypes.c_int),
        ]
        jack.jack_set_process_callback.restype = ctypes.c_int
        jack.jack_set_process_callback.argtypes = [JackClient, JackProcessCallback, ctypes.c_void_p]
        jack.jack_port_register.restype = JackPort
        jack.jack_port_register.argtypes = [
            JackClient,
            ctypes.c_char_p,
            ctypes.c_char_p,
            ctypes.c_ulong,
            ctypes.c_ulong,
        ]
        jack.jack_activate.restype = ctypes.c_int
        jack.jack_activate.argtypes = [JackClient]
        jack.jack_port_get_buffer.restype = ctypes.c_void_p
        jack.jack_port_get_buffer.argtypes = [JackPort, jack_nframes_t]
        jack.jack_connect.restype = ctypes.c_int
        jack.jack_connect.argtypes = [JackClient, ctypes.c_char_p, ctypes.c_char_p]
        jack.jack_port_name.restype = ctypes.c_char_p
        jack.jack_port_name.argtypes = [JackPort]
        jack.jack_get_ports.restype = ctypes.POINTER(ctypes.c_char_p)
        jack.jack_get_ports.argtypes = [
            JackClient,
            ctypes.c_char_p,
            ctypes.c_char_p,
            ctypes.c_ulong,
        ]
        jack.jack_free.argtypes = [ctypes.c_void_p]
        jack.jack_deactivate.argtypes = [JackClient]
        jack.jack_client_close.argtypes = [JackClient]

        status = ctypes.c_int(0)
        client = jack.jack_client_open(
            self.client_name.encode(),
            JackNoStartServer,
            ctypes.byref(status),
        )
        if not client:
            raise RuntimeError(f"jack_client_open failed status={status.value}")

        self._client = client
        self._ports = []
        for name in (b"in_l", b"in_r", b"out_l", b"out_r"):
            port = jack.jack_port_register(
                client,
                name,
                b"32 bit float mono audio",
                JackPortIsInput,
                0,
            )
            if not port:
                raise RuntimeError(f"jack_port_register failed for {name!r}")
            self._ports.append(port)

        meter = self

        @JackProcessCallback
        def _process(nframes, _arg):
            # Light scan only — avoid XRuns from heavy Python in the RT callback.
            step = 8 if nframes >= 64 else 1
            peaks = [0.0, 0.0, 0.0, 0.0]
            for i, port in enumerate(meter._ports):
                buf = jack.jack_port_get_buffer(port, nframes)
                if not buf:
                    continue
                samples = ctypes.cast(buf, ctypes.POINTER(jack_default_audio_sample_t))
                peak = 0.0
                n = 0
                while n < nframes:
                    v = samples[n]
                    if v < 0:
                        v = -v
                    if v > peak:
                        peak = v
                    n += step
                peaks[i] = peak
            with meter._lock:
                for i in range(4):
                    if peaks[i] > meter._peaks[i]:
                        meter._peaks[i] = peaks[i]
            return 0

        self._process_cb = _process
        if jack.jack_set_process_callback(client, _process, None) != 0:
            raise RuntimeError("jack_set_process_callback failed")
        if jack.jack_activate(client) != 0:
            raise RuntimeError("jack_activate failed")

        self._connect_sources(jack, client)
        with self._lock:
            self._available = True
            self._error = None

        # Stay in session until stop or server gone
        while not self._stop.is_set():
            time.sleep(0.5)
            # Lightweight liveness: try listing ports
            ports = jack.jack_get_ports(client, None, b"32 bit float mono audio", JackPortIsOutput)
            if not ports:
                raise RuntimeError("JACK server lost")
            jack.jack_free(ports)

    def _connect_sources(self, jack, client) -> None:
        """Fan-out from existing graph ports into our meter inputs."""
        our = [jack.jack_port_name(p).decode() for p in self._ports]
        sources = [
            ("system:capture_1", our[0]),
            ("system:capture_2", our[1]),
            ("mod-monitor:out_1", our[2]),
            ("mod-monitor:out_2", our[3]),
        ]
        for src, dst in sources:
            found = jack.jack_get_ports(
                client, src.encode(), b"32 bit float mono audio", JackPortIsOutput
            )
            ok = bool(found and found[0])
            if found:
                jack.jack_free(found)
            if not ok:
                log.info("jack vu: missing source %s", src)
                continue
            rc = jack.jack_connect(client, src.encode(), dst.encode())
            log.info("jack vu tap %s -> %s (rc=%s)", src, dst, rc)


_meter: JackVuMeter | None = None
_meter_lock = threading.Lock()


def get_shared_meter() -> JackVuMeter:
    global _meter
    with _meter_lock:
        if _meter is None:
            _meter = JackVuMeter()
            _meter.start()
        return _meter
