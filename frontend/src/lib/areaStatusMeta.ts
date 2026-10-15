
export type StatusLevel = "waspada" | "siaga" | "awas";
export type HazardKey = "gempa" | "tsunami" | "banjir" | "longsor" | "kebakaran" | "erupsi" | "cuaca" | "lainnya";

export const STATUS_LEVELS: { key: StatusLevel; label: string; icon: string; desc: string }[] = [
  { key: "waspada", label: "Waspada", icon: "info", desc: "Ada potensi bencana. Warga diminta tetap memantau informasi." },
  { key: "siaga", label: "Siaga", icon: "warning", desc: "Bencana bisa terjadi. Warga diminta bersiap dan menyiapkan tas siaga." },
  { key: "awas", label: "Awas", icon: "emergency_home", desc: "Bencana sedang atau segera terjadi. Warga diminta mengikuti arahan evakuasi." },
];

export const HAZARDS: { key: HazardKey; label: string; icon: string }[] = [
  { key: "gempa", label: "Gempa", icon: "vibration" },
  { key: "tsunami", label: "Tsunami", icon: "tsunami" },
  { key: "banjir", label: "Banjir", icon: "flood" },
  { key: "longsor", label: "Tanah Longsor", icon: "landslide" },
  { key: "kebakaran", label: "Kebakaran", icon: "local_fire_department" },
  { key: "erupsi", label: "Erupsi Gunung", icon: "volcano" },
  { key: "cuaca", label: "Cuaca Ekstrem", icon: "storm" },
  { key: "lainnya", label: "Lainnya", icon: "crisis_alert" },
];

export const LEVEL_LABEL: Record<StatusLevel, string> = { waspada: "Waspada", siaga: "Siaga", awas: "Awas" };
export const isStatusLevel = (v: unknown): v is StatusLevel => v === "waspada" || v === "siaga" || v === "awas";
export const isHazard = (v: unknown): v is HazardKey => HAZARDS.some((h) => h.key === v);

export function statusTitle(level: StatusLevel, hazardLabel: string): string {
  return `${LEVEL_LABEL[level].toUpperCase()} BENCANA ${hazardLabel.trim().toUpperCase()}`;
}

export const DURATIONS: { hours: number; label: string }[] = [
  { hours: 0, label: "Sampai diakhiri petugas" },
  { hours: 6, label: "6 jam" },
  { hours: 12, label: "12 jam" },
  { hours: 24, label: "24 jam" },
  { hours: 72, label: "3 hari" },
  { hours: 168, label: "7 hari" },
];

export const SCOPE_ALL = "ALL";
export const scopeLabel = (scope: string) => (scope === SCOPE_ALL ? "Seluruh wilayah" : scope);

export type AreaStatus = {
  id: string;
  scope: string;
  level: StatusLevel;
  hazard: HazardKey;
  hazard_label: string;
  title: string;
  message: string;
  created_at: string;
  ends_at: string | null;
  by: string;
  by_id: string | null;
  by_username: string | null;
  by_role: string | null;
  notified: number | null;
  ended_at?: string | null;
  ended_by?: string | null;
  ended_reason?: "manual" | "replaced" | null;
};

export function isActive(s: AreaStatus, now = Date.now()): boolean {
  return !s.ended_at && (!s.ends_at || Date.parse(s.ends_at) > now);
}
