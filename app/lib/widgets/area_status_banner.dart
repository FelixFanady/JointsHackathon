import 'package:flutter/material.dart';

import '../api.dart';
import '../auto_refresh.dart';
import '../theme.dart';

/// "Status Wilayah" card (e.g. SIAGA BENCANA GEMPA · Aceh), set by Support/Admin.
/// Same look as the other Beranda cards: white AppCard, 18 px title row with a count and chevron,
/// a 40 px tinted icon circle per item. Fetches by itself (country-wide + the phone's province) and
/// refreshes every minute while visible.
class AreaStatusCard extends StatefulWidget {
  const AreaStatusCard({super.key, this.onOpen, this.showWhenEmpty = true, this.margin = EdgeInsets.zero});
  /// Tap on the title row (Beranda: opens the Sekitar tab). Null = no chevron.
  final VoidCallback? onOpen;
  /// false = render nothing when no status is active (Sekitar page).
  final bool showWhenEmpty;
  final EdgeInsets margin;
  @override
  State<AreaStatusCard> createState() => AreaStatusCardState();
}

class AreaStatusCardState extends State<AreaStatusCard> with WidgetsBindingObserver, AutoRefresh {
  List<AreaStatus>? items;
  final expanded = <String>{};

  @override
  Duration get autoRefreshEvery => const Duration(seconds: 60);

  @override
  void initState() {
    super.initState();
    refresh();
  }

  /// Pull-to-refresh entry point. Never throws.
  Future<void> refresh() async {
    try {
      await autoRefresh();
    } catch (_) {
      if (mounted && items == null) setState(() => items = []);
    }
  }

  @override
  Future<void> autoRefresh() async {
    final nik = session.nik;
    if (nik == null) return;
    final p = await recentPlace();
    final s = await Api.areaStatus(nik, lat: p?.lat, lng: p?.lng);
    if (mounted) setState(() => items = s);
  }

  @override
  Widget build(BuildContext context) {
    final list = items;
    if (!widget.showWhenEmpty && (list == null || list.isEmpty)) return const SizedBox.shrink();
    final shown = (list ?? const <AreaStatus>[]).take(3).toList();
    return Padding(
      padding: widget.margin,
      child: AppCard(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // Title row — same as the old "Status Sekitar" card.
          InkWell(
            onTap: widget.onOpen,
            borderRadius: BorderRadius.circular(8),
            child: Row(children: [
              const Expanded(child: Text('Status Wilayah', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
              Text(
                list == null ? 'Memuat…' : (list.isEmpty ? 'Normal' : '${list.length} aktif'),
                style: TextStyle(color: list != null && list.isNotEmpty ? _colors(list.first.level).$3 : C.muted, fontWeight: FontWeight.w600),
              ),
              if (widget.onOpen != null) const Icon(Icons.chevron_right, color: C.muted),
            ]),
          ),
          const SizedBox(height: 16),
          if (list == null)
            _row(icon: Icons.radar, bg: C.primaryTint, fg: C.primary, title: 'Memeriksa status wilayah…')
          else if (list.isEmpty)
            _row(icon: Icons.verified_outlined, bg: C.okBg, fg: C.ok, title: 'Tidak ada status siaga di wilayah Anda')
          else
            for (var i = 0; i < shown.length; i++) ...[
              if (i > 0) const Divider(height: 28, color: C.field),
              _item(shown[i]),
            ],
          if (list != null && list.length > shown.length)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('+${list.length - shown.length} status lainnya', style: const TextStyle(fontSize: 13, color: C.muted)),
            ),
          const SizedBox(height: 4),
        ]),
      ),
    );
  }

  /// Plain icon + one line (loading / normal state), like the old Status Sekitar body.
  Widget _row({required IconData icon, required Color bg, required Color fg, required String title}) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Row(children: [
          CircleAvatar(radius: 24, backgroundColor: bg, child: Icon(icon, color: fg, size: 26)),
          const SizedBox(width: 14),
          Expanded(child: Text(title, style: const TextStyle(fontSize: 16))),
        ]),
      );

  Widget _item(AreaStatus s) {
    final (_, bg, fg) = _colors(s.level);
    final open = expanded.contains(s.id);
    final text = s.message.isNotEmpty ? s.message : _defaultMessage(s.level);
    return Semantics(
      label: '${s.title}, ${s.scopeLabel}. $text',
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => setState(() => open ? expanded.remove(s.id) : expanded.add(s.id)),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 56, height: 56,
              decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(16)),
              child: Icon(_icon(s.hazard), color: fg, size: 30),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, height: 1.25, letterSpacing: .2)),
                const SizedBox(height: 6),
                Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  _levelChip(s.level, bg, fg),
                  Text('${s.scopeLabel} • ${timeAgo(s.createdAt)}', style: const TextStyle(fontSize: 14, color: C.muted)),
                ]),
                const SizedBox(height: 10),
                Text(text, maxLines: open ? null : 3, overflow: open ? null : TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 15.5, height: 1.45, color: C.text)),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  /// Pill like StatusChip: icon + label, colour always paired with text.
  Widget _levelChip(String level, Color bg, Color fg) {
    final (icon, label) = switch (level) {
      'awas' => (Icons.emergency_outlined, 'Awas'),
      'siaga' => (Icons.warning_amber_rounded, 'Siaga'),
      _ => (Icons.info_outline, 'Waspada'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 16, color: fg),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: fg)),
      ]),
    );
  }

  /// (accent, light background, text/icon colour) per level.
  static (Color, Color, Color) _colors(String level) => switch (level) {
        'awas' => (const Color(0xFFDC2626), const Color(0xFFFEE2E2), const Color(0xFF991B1B)),
        'siaga' => (const Color(0xFFF97316), const Color(0xFFFFEDD5), const Color(0xFF9A3412)),
        _ => (const Color(0xFFEAB308), const Color(0xFFFEF9C3), const Color(0xFF854D0E)),
      };

  // Same wording as the dashboard (frontend/src/lib/areaStatusMeta.ts STATUS_LEVELS).
  static String _defaultMessage(String level) => switch (level) {
        'awas' => 'Bencana sedang atau segera terjadi. Warga diminta mengikuti arahan evakuasi.',
        'siaga' => 'Bencana bisa terjadi. Warga diminta bersiap dan menyiapkan tas siaga.',
        _ => 'Ada potensi bencana. Warga diminta tetap memantau informasi.',
      };

  static IconData _icon(String hazard) => switch (hazard) {
        'gempa' => Icons.vibration,
        'tsunami' => Icons.tsunami,
        'banjir' => Icons.flood,
        'longsor' => Icons.landslide_outlined,
        'kebakaran' => Icons.local_fire_department_outlined,
        'erupsi' => Icons.volcano_outlined,
        'cuaca' => Icons.thunderstorm_outlined,
        _ => Icons.crisis_alert,
      };
}
