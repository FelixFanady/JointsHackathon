/**
 * One colour per incident category for the support map (markers + legend). Client-safe.
 * Categories are the ones the mobile app offers (app/lib/theme.dart incidentCategories).
 */

export const CATEGORY_COLORS: Record<string, string> = {
  // Bencana alam
  "Gempa Bumi": "#ea580c", // oranye
  "Tsunami": "#0369a1", // biru laut
  "Banjir": "#0891b2", // biru toska
  "Kebakaran": "#dc2626", // merah
  "Longsor": "#92400e", // cokelat
  "Bencana Lainnya": "#7c3aed", // ungu
  // Kriminalitas & keamanan
  "Pencurian": "#be185d", // magenta
  "Penjambretan": "#db2777", // merah muda
  "Perampokan": "#334155", // abu gelap
};
export const OTHER_COLOR = "#64748b"; // "Darurat" / kategori lain

export const colorFor = (category: string) => CATEGORY_COLORS[category] ?? OTHER_COLOR;

/** Category shares of a group of reports, biggest first: drives the marker colour (pie for mixed points). */
export function categoryShares(categories: string[]): { category: string; color: string; share: number; count: number }[] {
  const m = new Map<string, number>();
  categories.forEach((c) => m.set(c, (m.get(c) ?? 0) + 1));
  const total = categories.length || 1;
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category, count]) => ({ category, color: colorFor(category), share: count / total, count }));
}
