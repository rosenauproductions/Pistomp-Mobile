/** Display label for a MOD snapshot (name from API, else A/B/C…, else 1-based index). */
export function snapshotLabel(id: string, name?: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;

  const n = Number(id);
  if (Number.isFinite(n) && n >= 0 && n < 26) {
    return String.fromCharCode(65 + n);
  }
  return `#${Number.isFinite(n) ? n + 1 : id}`;
}
