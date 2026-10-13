export type Role = "admin" | "support";
export type ReportStatus = "pending" | "valid" | "false";
export type ReportKind = "sos" | "report";

export type Profile = {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  unit: string | null;
  active: boolean;
  created_at?: string;
};

export type AiVerdict = {
  verdict: "valid" | "uncertain" | "invalid";
  confidence: number;
  summary: string;
  reasons: string[];
  recommended_action: string;
};

export type Report = {
  id: string;
  kind: ReportKind;
  nik: string | null;
  reporter_name: string;
  category: string;
  description: string | null;
  photo_url: string | null;
  lat: number;
  lng: number;
  address: string | null;
  status: ReportStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  ai_verdict: AiVerdict | null;
  ai_checked_at: string | null;
  created_at: string;
};

export type Citizen = {
  nik: string;
  full_name: string;
  active: boolean;
  created_at: string;
  email?: string | null;
  phone?: string | null;
  photo?: string | null; // compressed base64 data-URI
  birth_date?: string | null; // YYYY-MM-DD
  address?: string | null;
};

export type Settings = {
  emergency_threshold: number;
  emergency_window_minutes: number;
  cluster_radius_m: number;
};

export const DEFAULT_SETTINGS: Settings = {
  emergency_threshold: 15,
  emergency_window_minutes: 60,
  cluster_radius_m: 500,
};
