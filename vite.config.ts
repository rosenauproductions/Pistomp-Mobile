import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

/** Pi MOD-UI :80; MOD Desktop (emulator) :18181 — override via MOD_API_TARGET */
const modApi = process.env.MOD_API_TARGET ?? "http://127.0.0.1:80";

const isModDesktopDev = modApi.includes("18181");
/** MOD Desktop rejects :5173; accepts no Origin or http://127.0.0.1:18181 (not localhost). */
const modDesktopOrigin = "http://127.0.0.1:18181";

/** MOD Desktop has no /pedalboard/current; expose last.json for local dev sync. */
function modLastJsonPlugin(): Plugin {
  return {
    name: "mod-last-json",
    configureServer(server) {
      server.middlewares.use("/mod-last.json", (_req, res) => {
        const candidates = [
          process.env.MOD_LAST_JSON,
          join(homedir(), "Documents", "MOD Desktop", "last.json"),
          join(homedir(), ".pistomp_emulator", "last.json"),
        ].filter((p): p is string => Boolean(p));

        for (const path of candidates) {
          if (!existsSync(path)) continue;
          res.setHeader("Content-Type", "application/json");
          res.end(readFileSync(path, "utf8"));
          return;
        }
        res.statusCode = 404;
        res.end("{}");
      });
    },
  };
}

const buildId = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").slice(0, 12);

export default defineConfig({
  plugins: [react(), modLastJsonPlugin()],
  base: "/",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(buildId),
  },
  server: {
    port: 5173,
    proxy: {
      "/reset": { target: modApi, changeOrigin: true },
      "/pedalboard": { target: modApi, changeOrigin: true },
      "/effect": { target: modApi, changeOrigin: true },
      "/snapshot": { target: modApi, changeOrigin: true },
      "/pistomp/audio": {
        target: "http://127.0.0.1:8766",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pistomp\/audio/, ""),
      },
      "/websocket": {
        target: modApi,
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("error", (err, _req, resOrSocket) => {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === "ECONNRESET" || code === "EPIPE") return;
            console.warn("[vite] proxy:", err.message);
            const sock = resOrSocket as { destroy?: () => void } | undefined;
            sock?.destroy?.();
          });
          if (isModDesktopDev) {
            proxy.on("proxyReqWs", (proxyReq) => {
              proxyReq.setHeader("Origin", modDesktopOrigin);
            });
          }
        },
      },
    },
  },
});
