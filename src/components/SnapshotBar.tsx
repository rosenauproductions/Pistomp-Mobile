import type { SnapshotsMap } from "../api/types";
import { snapshotLabel } from "../lib/snapshotLabel";

interface Props {
  snapshots: SnapshotsMap;
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function SnapshotBar({ snapshots, activeId, onSelect }: Props) {
  const entries = Object.entries(snapshots).sort(([a], [b]) => Number(a) - Number(b));

  if (entries.length === 0) {
    return <p className="snapshot-empty">No snapshots on this pedalboard.</p>;
  }

  return (
    <div className="snapshot-bar" role="tablist" aria-label="Snapshots">
      {entries.map(([id, name]) => {
        const label = snapshotLabel(id, name);
        return (
          <div key={id} className="snap-slot">
            <button
              type="button"
              role="tab"
              aria-selected={activeId === id}
              className={`snap-btn ${activeId === id ? "active" : ""}`}
              title={label}
              onClick={() => onSelect(id)}
            >
              {label}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function snapshotCount(snapshots: SnapshotsMap): number {
  return Object.keys(snapshots).length;
}
