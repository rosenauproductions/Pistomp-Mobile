/** Injected at build time (vite.config.ts). */
declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;

export function getAppVersionLabel(): string {
  const v = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
  const b = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "local";
  return `${v} (build ${b})`;
}

export function getAppVersion(): string {
  return typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
}

export function getBuildId(): string {
  return typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "local";
}
