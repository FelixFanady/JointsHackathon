import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../api.dart';
import '../auto_refresh.dart';
import '../theme.dart';
import 'report_detail_sheet.dart';
import '../widgets/area_status_banner.dart';

/// "Sekitar Saya" tab: reports and SOS alerts near the citizen, shown big and detailed
/// (mini map, address, distance, status) so most of it is readable without opening anything.
class NearbyScreen extends StatefulWidget {
  const NearbyScreen({super.key});
  @override
  State<NearbyScreen> createState() => _NearbyScreenState();
}

class _NearbyScreenState extends State<NearbyScreen> with WidgetsBindingObserver, AutoRefresh {
  static const radii = [1.0, 3.0, 5.0, 10.0];

  Place? me;
  String? myAddress;
  String? locError;
  String? error;
  List<NearbyItem>? items;
  double radius = 5;
  String filter = 'all'; // all | report | sos
  bool byDistance = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  // Silent refresh (every 20 s while visible, and right after a new SOS/report).
  @override
  Future<void> autoRefresh() async {
    final p = await recentPlace();
    if (p == null) return;
    final n = await Api.nearby(p.lat, p.lng, radiusKm: radius);
    if (mounted) setState(() { me = p; items = n; error = null; });
  }

  Future<void> _load() async {
    setState(() { error = null; locError = null; });
    final (p, e) = await currentPlace();
    if (p == null) {
      if (mounted) setState(() { locError = e; items ??= []; });
      return;
    }
    rememberPlace(p);
    if (mounted) setState(() => me = p);
    addressFor(p).then((a) { if (mounted && a != null) setState(() => myAddress = a); });
    await _fetch(p);
  }

  Future<void> _fetch(Place p) async {
    try {
      final n = await Api.nearby(p.lat, p.lng, radiusKm: radius);
      if (mounted) setState(() => items = n);
    } on ApiException catch (e) {
      if (mounted) setState(() { error = e.message; items ??= []; });
    } catch (_) {
      if (mounted) setState(() { error = 'Gagal memuat laporan sekitar.'; items ??= []; });
    }
  }

  void _setRadius(double r) {
    if (r == radius) return;
    setState(() { radius = r; items = null; });
    if (me != null) _fetch(me!);
  }

  List<NearbyItem> get shown {
    final l = (items ?? []).where((e) => filter == 'all' || e.kind == filter).toList();
    l.sort(byDistance
        ? (a, b) => a.distanceKm.compareTo(b.distanceKm)
        : (a, b) => b.createdAt.compareTo(a.createdAt));
    return l;
  }

  @override
  Widget build(BuildContext context) {
    final all = items ?? [];
    final list = shown;
    final head = <Widget>[
      const Text('Sekitar Saya', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w700, letterSpacing: -.6)),
      const SizedBox(height: 4),
      Text('Laporan dan peringatan warga dalam radius ${radius.round()} km dari lokasi Anda.', style: const TextStyle(color: C.muted, fontSize: 15)),
      const SizedBox(height: 16),
      const AreaStatusCard(showWhenEmpty: false, margin: EdgeInsets.only(bottom: 12)),
      _locationCard(),
      const SizedBox(height: 12),
      _radiusRow(),
      const SizedBox(height: 16),
      Row(children: [
        _stat('${all.length}', 'Total', Icons.layers_outlined, C.primary, C.primaryTint),
        const SizedBox(width: 10),
        _stat('${all.where((e) => e.kind == 'sos').length}', 'SOS', Icons.warning_amber_rounded, C.emergency, const Color(0xFFFEE2E2)),
        const SizedBox(width: 10),
        _stat('${all.where((e) => e.status == 'valid').length}', 'Valid', Icons.verified_outlined, C.ok, C.okBg),
      ]),
      const SizedBox(height: 16),
      Row(children: [
        Expanded(child: _segmented()),
        const SizedBox(width: 10),
        _sortChip(),
      ]),
      const SizedBox(height: 16),
      if (error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(error!, style: const TextStyle(color: C.emergency))),
      if (items == null)
        const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()))
      else if (list.isEmpty)
        _empty(),
    ];

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        itemCount: head.length + (items == null ? 0 : list.length),
        itemBuilder: (_, i) => i < head.length
            ? head[i]
            : Padding(padding: const EdgeInsets.only(bottom: 14), child: _NearbyCard(item: list[i - head.length])),
      ),
    );
  }

  Widget _locationCard() => AppCard(
        padding: const EdgeInsets.fromLTRB(14, 12, 6, 12),
        child: Row(children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(color: C.primaryTint, borderRadius: BorderRadius.circular(14)),
            child: const Icon(Icons.my_location, color: C.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Lokasi Anda', style: TextStyle(fontSize: 12, color: C.muted, fontWeight: FontWeight.w600)),
              const SizedBox(height: 2),
              Text(
                locError ?? myAddress ?? (me != null ? 'Mencari alamat…' : 'Mencari lokasi…'),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5, color: locError != null ? C.warnText : C.text),
              ),
            ]),
          ),
          IconButton(onPressed: _load, tooltip: 'Perbarui lokasi', icon: const Icon(Icons.refresh, color: C.primary)),
        ]),
      );

  Widget _radiusRow() => Row(children: [
        const Text('Radius', style: TextStyle(fontWeight: FontWeight.w600, color: C.muted)),
        const SizedBox(width: 10),
        for (final r in radii)
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              label: Text('${r.round()} km'),
              selected: radius == r,
              onSelected: (_) => _setRadius(r),
              showCheckmark: false,
              selectedColor: C.primary,
              backgroundColor: C.field,
              side: BorderSide.none,
              shape: const StadiumBorder(),
              labelStyle: TextStyle(fontWeight: FontWeight.w600, color: radius == r ? Colors.white : C.text),
            ),
          ),
      ]);

  Widget _stat(String n, String label, IconData icon, Color fg, Color bg) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(color: C.card, borderRadius: BorderRadius.circular(18), boxShadow: shadowSm),
          child: Row(children: [
            Container(width: 34, height: 34, decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(11)), child: Icon(icon, size: 19, color: fg)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(items == null ? '–' : n, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, height: 1.1)),
                Text(label, style: const TextStyle(fontSize: 12, color: C.muted)),
              ]),
            ),
          ]),
        ),
      );

  Widget _segmented() {
    Widget seg(String k, String label) => Expanded(
          child: GestureDetector(
            onTap: () => setState(() => filter = k),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              padding: const EdgeInsets.symmetric(vertical: 9),
              decoration: BoxDecoration(color: filter == k ? Colors.white : Colors.transparent, borderRadius: BorderRadius.circular(11), boxShadow: filter == k ? shadowSm : null),
              child: Center(child: Text(label, style: TextStyle(fontWeight: FontWeight.w600, color: filter == k ? C.text : C.muted))),
            ),
          ),
        );
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: C.field, borderRadius: BorderRadius.circular(14)),
      child: Row(children: [seg('all', 'Semua'), seg('report', 'Laporan'), seg('sos', 'SOS')]),
    );
  }

  Widget _sortChip() => Material(
        color: C.field,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => setState(() => byDistance = !byDistance),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(byDistance ? Icons.near_me_outlined : Icons.schedule, size: 18, color: C.primary),
              const SizedBox(width: 6),
              Text(byDistance ? 'Terdekat' : 'Terbaru', style: const TextStyle(fontWeight: FontWeight.w600)),
            ]),
          ),
        ),
      );

  Widget _empty() => Padding(
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 16),
        child: Column(children: [
          const CircleAvatar(radius: 40, backgroundColor: C.okBg, child: Icon(Icons.shield_outlined, size: 40, color: C.ok)),
          const SizedBox(height: 16),
          Text(locError != null ? 'Lokasi belum tersedia' : 'Belum ada laporan di sekitar', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(
            locError != null
                ? 'Aktifkan lokasi agar laporan warga di sekitar Anda bisa ditampilkan.'
                : 'Tidak ada laporan warga dalam radius ${radius.round()} km. Coba perbesar radius.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: C.muted),
          ),
        ]),
      );
}

/// One nearby report/SOS: mini map on top, then category, status, address, distance and verification.
class _NearbyCard extends StatelessWidget {
  const _NearbyCard({required this.item});
  final NearbyItem item;

  @override
  Widget build(BuildContext context) {
    final i = item;
    final sos = i.kind == 'sos';
    final fg = sos ? C.emergency : C.primary;
    final bg = sos ? const Color(0xFFFEE2E2) : C.primaryTint;
    final verified = i.status == 'valid'
        ? (i.verifiedBy == 'otomatis' ? 'Diverifikasi otomatis (AI + BMKG)' : i.verifiedBy == 'petugas' ? 'Diverifikasi petugas' : 'Terverifikasi')
        : null;
    return AppCard(
      padding: EdgeInsets.zero,
      onTap: () => showNearbyDetail(context, i),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        ClipRRect(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          child: SizedBox(
            height: 140,
            child: Stack(children: [
              IgnorePointer(
                child: FlutterMap(
                  options: MapOptions(initialCenter: LatLng(i.lat, i.lng), initialZoom: 15, interactionOptions: const InteractionOptions(flags: InteractiveFlag.none)),
                  children: [
                    TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', userAgentPackageName: 'id.siagaku.app'),
                    MarkerLayer(markers: [
                      Marker(
                        point: LatLng(i.lat, i.lng),
                        width: 44, height: 44,
                        child: Container(
                          decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white, border: Border.all(color: fg, width: 2.5), boxShadow: shadowMd),
                          child: Icon(sos ? Icons.warning_amber_rounded : iconForCategory(i.category), size: 22, color: fg),
                        ),
                      ),
                    ]),
                  ],
                ),
              ),
              Positioned(left: 10, top: 10, child: _pill(Icons.near_me, '${distanceLabel(i.distanceKm)} dari Anda', Colors.white, C.text)),
              if (sos) Positioned(right: 10, top: 10, child: _pill(Icons.sos, 'SOS', C.emergency, Colors.white)),
            ]),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(
                width: 46, height: 46,
                decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(14)),
                child: Icon(sos ? Icons.warning_amber_rounded : iconForCategory(i.category), color: fg),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(sos ? 'SOS • ${i.category}' : i.category, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
                  const SizedBox(height: 2),
                  Text('${reportCode(i.id, i.kind)} • ${timeAgo(i.createdAt)}', style: const TextStyle(color: C.muted, fontSize: 13)),
                ]),
              ),
              StatusChip(i.status),
            ]),
            if (i.address != null && i.address!.trim().isNotEmpty) ...[
              const SizedBox(height: 12),
              _line(Icons.location_on_outlined, i.address!, C.muted),
            ],
            if (verified != null) ...[
              const SizedBox(height: 8),
              _line(Icons.verified_outlined, verified, C.ok),
            ],
            const SizedBox(height: 10),
            Container(height: 1, color: C.field),
            const SizedBox(height: 8),
            const Row(children: [
              Text('Lihat detail', style: TextStyle(color: C.primary, fontWeight: FontWeight.w600)),
              Spacer(),
              Icon(Icons.chevron_right, color: C.primary),
            ]),
          ]),
        ),
      ]),
    );
  }

  Widget _pill(IconData icon, String label, Color bg, Color fg) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: bg.withValues(alpha: .95), borderRadius: BorderRadius.circular(99), boxShadow: shadowSm),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 14, color: fg),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: fg)),
        ]),
      );

  Widget _line(IconData icon, String text, Color iconColor) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, size: 18, color: iconColor),
        const SizedBox(width: 8),
        Expanded(child: Text(text, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, height: 1.35))),
      ]);
}
