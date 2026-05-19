import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  server: {
    port: 5173,
    proxy: {
      "/pedalboard": { target: "http://127.0.0.1:80", changeOrigin: true },
      "/effect": { target: "http://127.0.0.1:80", changeOrigin: true },
      "/snapshot": { target: "http://127.0.0.1:80", changeOrigin: true },
      "/websocket": { target: "ws://127.0.0.1:80", ws: true },
    },
  },
});
