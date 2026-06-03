export type ConnectionMode = "live" | "demo" | "offline";

export interface PedalboardSummary {
  title: string;
  bundle: string;
  broken?: boolean;
}

export interface EffectPort {
  symbol: string;
  value: number;
  valid?: boolean;
  minimum?: number;
  maximum?: number;
}

export interface EffectPlugin {
  instance: string;
  title?: string;
  uri?: string;
  /** Plugin category color from MOD metadata (`/effect/get`), e.g. `#5C87B5`. */
  color?: string;
  bypassed: boolean;
  valid?: boolean;
  ports: EffectPort[];
}

export interface PedalboardInfo {
  title: string;
  plugins: EffectPlugin[];
}

export type SnapshotsMap = Record<string, string>;

export interface GlobalControl {
  kind: "gain" | "master";
  label: string;
  instance: string;
  port: string;
  value: number;
  min: number;
  max: number;
}
