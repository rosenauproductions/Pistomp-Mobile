import type { PedalboardSummary } from "../api/types";
import { Sheet } from "./Sheet";

interface Props {
  open: boolean;
  pedalboards: PedalboardSummary[];
  activeBundle: string;
  onClose: () => void;
  onSelect: (pb: PedalboardSummary) => void;
}

export function PedalboardSheet({
  open,
  pedalboards,
  activeBundle,
  onClose,
  onSelect,
}: Props) {
  return (
    <Sheet title="Pedalboards" open={open} onClose={onClose}>
      <div className="sheet-list">
        {pedalboards.map((pb) => (
          <button
            key={pb.bundle}
            type="button"
            className={`sheet-item ${pb.bundle === activeBundle ? "active" : ""}`}
            onClick={() => {
              onSelect(pb);
              onClose();
            }}
          >
            {pb.title}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
