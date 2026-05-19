import type { SnapshotsMap } from "../api/types";

interface Props {
  snapshots: SnapshotsMap;
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function SnapshotBar({ snapshots, activeId, onSelect }: Props) {
  const entries = Object.entries(snapshots).sort(([a], [b]) => Number(a) - Number(b));
  const ab = entries.slice(0, 2);

  if (ab.length === 0) {
    return (
      <div className="snapshot-bar">
        <button type="button" className="snap-btn" onClick={() => onSelect("0")}>
          A
        </button>
        <button type="button" className="snap-btn" onClick={() => onSelect("1")}>
          B
        </button>
      </div>
    );
  }

  return (
    <div className="snapshot-bar">
      {ab.map(([id, name]) => (
        <button
          key={id}
          type="button"
          className={`snap-btn ${activeId === id ? "active" : ""}`}
          onClick={() => onSelect(id)}
        >
          {name || (id === "0" ? "A" : "B")}
        </button>
      ))}
    </div>
  );
}
