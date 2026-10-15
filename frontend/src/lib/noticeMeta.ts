
export type NoticeLevelKey = "danger" | "warning" | "info";
export type NoticeKindKey = "bencana" | "kriminal" | "umum";

export const NOTICE_CATEGORIES: { key: NoticeLevelKey; label: string; icon: string; desc: string }[] = [
  { key: "danger", label: "Darurat", icon: "emergency_home", desc: "Ancaman langsung, segera bertindak" },
  { key: "warning", label: "Sedang", icon: "warning", desc: "Waspada, situasi perlu diperhatikan" },
  { key: "info", label: "Info", icon: "info", desc: "Pemberitahuan umum" },
];
export const LEVEL_LABEL: Record<NoticeLevelKey, string> = { danger: "Darurat", warning: "Sedang", info: "Info" };

export const NOTICE_KINDS: { key: NoticeKindKey; label: string; icon: string; sound: string }[] = [
  { key: "bencana", label: "Bencana alam", icon: "tsunami", sound: "Sirene bencana berbunyi 30 detik, satu kali." },
  { key: "kriminal", label: "Kriminal", icon: "local_police", sound: "Sirene polisi satu kali dan satu kali getar." },
  { key: "umum", label: "Umum", icon: "notifications", sound: "Bunyi notifikasi biasa, satu kali." },
];
export const KIND_LABEL: Record<NoticeKindKey, string> = { bencana: "Bencana alam", kriminal: "Kriminal", umum: "Umum" };
