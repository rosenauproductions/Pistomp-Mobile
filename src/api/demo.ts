import type { GlobalControl, PedalboardInfo, PedalboardSummary, SnapshotsMap } from "./types";

export const DEMO_PEDALBOARDS: PedalboardSummary[] = [
  { title: "Blues Drive", bundle: "/home/mod/.pedalboards/Blues-Drive.pedalboard" },
  { title: "Ambient Wash", bundle: "/home/mod/.pedalboards/Ambient-Wash.pedalboard" },
  { title: "Funk Comp", bundle: "/home/mod/.pedalboards/Funk-Comp.pedalboard" },
];

const demoX = (n: number) => n * 120;

export const DEMO_BOARD: PedalboardInfo = {
  title: "Blues Drive",
  connections: [
    { source: "capture_1", target: "Tuner/in" },
    { source: "Tuner/out", target: "Comp/in" },
    { source: "Comp/out", target: "Drive/in" },
    { source: "Drive/out", target: "Delay/in" },
    { source: "Delay/out", target: "Chorus/in" },
    { source: "Chorus/out", target: "Reverb/in" },
    { source: "Reverb/out", target: "Gain/in" },
    { source: "Gain/out", target: "Master/in" },
    { source: "Master/out", target: "playback_1" },
  ],
  plugins: [
    {
      instance: "Tuner",
      uri: "demo/tuner",
      color: "#6BB5FF",
      bypassed: false,
      x: demoX(0),
      y: 20,
      ports: [{ symbol: "Level", value: 0.8 }],
    },
    {
      instance: "Comp",
      uri: "demo/comp",
      color: "#E8A84A",
      bypassed: false,
      x: demoX(1),
      y: 20,
      ports: [
        { symbol: "Threshold", value: 0.4, minimum: 0, maximum: 1 },
        { symbol: "Ratio", value: 0.6, minimum: 0, maximum: 1 },
      ],
    },
    {
      instance: "Drive",
      uri: "demo/drive",
      color: "#E85D5D",
      bypassed: false,
      x: demoX(2),
      y: 20,
      ports: [{ symbol: "Drive", value: 0.5, minimum: 0, maximum: 1 }],
    },
    {
      instance: "Delay",
      uri: "demo/delay",
      color: "#9B7EDE",
      bypassed: true,
      x: demoX(3),
      y: 20,
      ports: [],
    },
    {
      instance: "Chorus",
      uri: "demo/chorus",
      color: "#C77DFF",
      bypassed: false,
      x: demoX(4),
      y: 20,
      ports: [],
    },
    {
      instance: "Reverb",
      uri: "demo/reverb",
      color: "#5CB8A8",
      bypassed: true,
      x: demoX(5),
      y: 20,
      ports: [],
    },
    {
      instance: "Gain",
      uri: "demo/gain",
      color: "#F4D35E",
      bypassed: false,
      x: demoX(6),
      y: 20,
      ports: [{ symbol: "Gain", value: 0.55 }],
    },
    {
      instance: "Master",
      uri: "demo/master",
      color: "#ADB5BD",
      bypassed: false,
      x: demoX(7),
      y: 20,
      ports: [{ symbol: "Volume", value: 0.72 }],
    },
  ],
};

export const DEMO_SNAPSHOTS: SnapshotsMap = {
  "0": "Clean",
  "1": "Crunch",
  "2": "Lead",
  "3": "Ambient",
  "4": "Solo",
};

export const DEMO_GLOBALS: GlobalControl[] = [
  {
    kind: "gain",
    label: "Gain",
    instance: "Gain",
    port: "Gain",
    value: 0.55,
    min: 0,
    max: 1,
  },
  {
    kind: "master",
    label: "Master",
    instance: "Master",
    port: "Volume",
    value: 0.72,
    min: 0,
    max: 1,
  },
];
