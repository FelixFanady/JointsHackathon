
export const CATEGORY_COLORS: Record<string, string> = {
  "Gempa Bumi": "#ea580c",
  "Tsunami": "#0369a1",
  "Banjir": "#0891b2",
  "Kebakaran": "#dc2626",
  "Longsor": "#92400e",
  "Bencana Lainnya": "#7c3aed",
  "Pencurian": "#be185d",
  "Penjambretan": "#db2777",
  "Perampokan": "#334155",
};
export const OTHER_COLOR = "#64748b";

export const colorFor = (category: string) => CATEGORY_COLORS[category] ?? OTHER_COLOR;

export function categoryShares(categories: string[]): { category: string; color: string; share: number; count: number }[] {
  const m = new Map<string, number>();
  categories.forEach((c) => m.set(c, (m.get(c) ?? 0) + 1));
  const total = categories.length || 1;
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category, count]) => ({ category, color: colorFor(category), share: count / total, count }));
}
