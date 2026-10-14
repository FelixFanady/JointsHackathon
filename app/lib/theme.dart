import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Tokens from stitch_siagaku_emergency_design_system / DESIGN.md ("Siaga Klasik").
class C {
  static const primary = Color(0xFF1D4ED8);
  static const primaryDark = Color(0xFF0037B0);
  static const primaryTint = Color(0xFFE6EDFD);
  static const primaryFixed = Color(0xFFDCE1FF);
  static const emergency = Color(0xFFE5383B);
  static const emergencyDark = Color(0xFFB81120);
  static const emergencyGlow = Color(0xFFFF6B6B);
  static const warn = Color(0xFFF59E0B);
  static const warnBg = Color(0xFFFEF3C7);
  static const warnText = Color(0xFF92400E);
  static const ok = Color(0xFF16A34A);
  static const okBg = Color(0xFFDCFCE7);
  static const falseBg = Color(0xFFF3F4F6);
  static const falseFg = Color(0xFF6B7280);
  static const canvas = Color(0xFFF7F8FA);
  static const surface = Color(0xFFFAF8FF);
  static const field = Color(0xFFEEF0F4);
  static const card = Colors.white;
  static const text = Color(0xFF14213D);
  static const muted = Color(0xFF5B6478);
  static const outline = Color(0xFFC4C5D7);
}

final shadowSm = [BoxShadow(color: const Color(0xFF14213D).withValues(alpha: .04), blurRadius: 8, offset: const Offset(0, 2))];
final shadowMd = [BoxShadow(color: const Color(0xFF14213D).withValues(alpha: .08), blurRadius: 16, offset: const Offset(0, 6))];
final shadowLg = [BoxShadow(color: const Color(0xFF14213D).withValues(alpha: .12), blurRadius: 32, offset: const Offset(0, 12))];

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: C.primary, primary: C.primary, surface: C.surface, error: C.emergency),
    scaffoldBackgroundColor: C.surface,
  );
  final t = GoogleFonts.interTextTheme(base.textTheme).apply(bodyColor: C.text, displayColor: C.text);
  return base.copyWith(
    textTheme: t,
    appBarTheme: AppBarTheme(
      backgroundColor: C.surface,
      foregroundColor: C.text,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleTextStyle: GoogleFonts.inter(fontSize: 17, fontWeight: FontWeight.w600, color: C.text),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: C.field,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      hintStyle: const TextStyle(color: C.muted),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: C.primary, width: 1.5)),
    ),
  );
}

/// Primary pill button: 52px, civic blue.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({super.key, required this.label, required this.onPressed, this.icon, this.loading = false, this.color = C.primary});
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !loading;
    return SizedBox(
      height: 52,
      width: double.infinity,
      child: FilledButton(
        onPressed: enabled ? onPressed : null,
        style: FilledButton.styleFrom(
          backgroundColor: color,
          disabledBackgroundColor: C.primaryFixed,
          foregroundColor: Colors.white,
          disabledForegroundColor: C.muted,
          shape: const StadiumBorder(),
          textStyle: GoogleFonts.inter(fontSize: 17, fontWeight: FontWeight.w600),
        ),
        child: loading
            ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
            : Row(mainAxisSize: MainAxisSize.min, children: [
                Text(label),
                if (icon != null) ...[const SizedBox(width: 8), Icon(icon, size: 20)],
              ]),
      ),
    );
  }
}

/// Secondary action (e.g. "Kembali") under a PrimaryButton: outlined white pill, same height and width,
/// so it is clearly a button but never competes with the main action. Same look as the SOS flow's back button.
class SecondaryButton extends StatelessWidget {
  const SecondaryButton({super.key, required this.label, required this.onPressed, this.icon = Icons.arrow_back_rounded});
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    final style = OutlinedButton.styleFrom(
      foregroundColor: C.text,
      backgroundColor: Colors.white,
      disabledForegroundColor: C.muted.withValues(alpha: .6),
      side: BorderSide(color: enabled ? C.outline : C.outline.withValues(alpha: .5), width: 1.5),
      shape: const StadiumBorder(),
      elevation: 0,
      textStyle: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w600),
    ).copyWith(overlayColor: WidgetStatePropertyAll(C.primary.withValues(alpha: .06)));
    return SizedBox(
      height: 52,
      width: double.infinity,
      child: icon == null
          ? OutlinedButton(onPressed: onPressed, style: style, child: Text(label))
          : OutlinedButton.icon(onPressed: onPressed, style: style, icon: Icon(icon, size: 20), label: Text(label)),
    );
  }
}

class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.onTap, this.color = C.card});
  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  final Color color;
  @override
  Widget build(BuildContext context) => Material(
        color: Colors.transparent,
        child: Ink(
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(20), boxShadow: shadowSm),
          child: InkWell(borderRadius: BorderRadius.circular(20), onTap: onTap, child: Padding(padding: padding, child: child)),
        ),
      );
}

/// Status chip: color is always paired with an icon + Indonesian label.
class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});
  final String status;
  @override
  Widget build(BuildContext context) {
    late final Color bg, fg;
    late final IconData icon;
    late final String label;
    switch (status) {
      case 'valid':
        bg = C.okBg; fg = C.ok; icon = Icons.check_circle_outline; label = 'Valid';
      case 'false':
        bg = C.falseBg; fg = C.falseFg; icon = Icons.highlight_off; label = 'Laporan Ditolak';
      default:
        bg = C.warnBg; fg = C.warnText; icon = Icons.schedule; label = 'Menunggu Verifikasi';
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 16, color: fg),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

String timeAgo(String iso) {
  final d = DateTime.tryParse(iso);
  if (d == null) return '';
  final s = DateTime.now().difference(d).inSeconds;
  if (s < 60) return 'baru saja';
  final m = s ~/ 60;
  if (m < 60) return '$m mnt lalu';
  final h = m ~/ 60;
  if (h < 24) return '$h jam lalu';
  return '${h ~/ 24} hari lalu';
}

String distanceLabel(double km) => km < 1 ? '${(km * 1000).round()} m' : '${km.toStringAsFixed(1)} km';

/// Report ID seen by the citizen, Support and Admin: "LW-1A2B3C4D" (laporan warga) or "SOS-1A2B3C4D".
/// Same rule as the web dashboard (frontend/src/lib/util.ts reportCode) — keep them identical.
String reportCode(String id, String kind) {
  final hex = id.replaceAll(RegExp(r'[^0-9a-zA-Z]'), '');
  return '${kind == 'sos' ? 'SOS' : 'LW'}-${hex.substring(0, hex.length < 8 ? hex.length : 8).toUpperCase()}';
}

/// (icon, label, description) per incident category - mirrors the design's classification step.
const incidentCategories = <String, List<(IconData, String, String)>>{
  'BENCANA ALAM': [
    (Icons.tsunami, 'Tsunami', 'Gelombang laut pasang'),
    (Icons.vibration, 'Gempa Bumi', 'Guncangan seismik'),
    (Icons.flood, 'Banjir', 'Genangan luapan air'),
    (Icons.local_fire_department_outlined, 'Kebakaran', 'Titik api perumahan/lahan'),
    (Icons.landslide_outlined, 'Longsor', 'Runtuhan lereng / tebing'),
    (Icons.crisis_alert, 'Bencana Lainnya', 'Pilih kategori umum'),
  ],
  'KRIMINALITAS & KEAMANAN': [
    (Icons.lock_open, 'Pencurian', 'Pembobolan rumah & toko'),
    (Icons.directions_run, 'Penjambretan', 'Pencurian di jalan umum'),
    (Icons.shield_outlined, 'Perampokan', 'Tindak kekerasan dengan senjata tajam'),
  ],
};

IconData iconForCategory(String c) {
  for (final list in incidentCategories.values) {
    for (final e in list) {
      if (e.$2 == c) return e.$1;
    }
  }
  return Icons.report_gmailerrorred;
}
