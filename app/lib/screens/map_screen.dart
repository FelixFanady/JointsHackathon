import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../api.dart';
import '../auto_refresh.dart';
import '../theme.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});
  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> with WidgetsBindingObserver, AutoRefresh {
  final controller = MapController();
  bool sosMode = true;
  Place? me;
  List<NearbyItem> items = [];
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  Future<void> autoRefresh() async {
    final p = await recentPlace();
    if (p == null) return;
    final fresh = await Api.nearby(p.lat, p.lng);
    if (mounted) setState(() { me = p; items = fresh; error = null; });
  }

  Future<void> _load() async {
    setState(() { loading = true; error = null; });
    final (p, e) = await currentPlace();
    me = p;
    if (p != null) rememberPlace(p);
    if (p == null) {
      setState(() { loading = false; error = e; });
      return;
    }
    try {
      items = await Api.nearby(p.lat, p.lng);
      controller.move(LatLng(p.lat, p.lng), 14);
    } on ApiException catch (e) {
      error = e.message;
    }
    if (mounted) setState(() => loading = false);
  }

  List<NearbyItem> get shown => items.where((e) => sosMode ? e.kind == 'sos' : e.kind == 'report').toList();

  Color _color(NearbyItem i) => i.status == 'valid' ? C.emergencyDark : (i.kind == 'sos' ? C.emergency : C.warn);

  @override
  Widget build(BuildContext context) {
    final list = shown;
    final center = me != null ? LatLng(me!.lat, me!.lng) : const LatLng(-6.2, 106.816);
    return Stack(children: [
      Positioned.fill(
        child: FlutterMap(
          mapController: controller,
          options: MapOptions(initialCenter: center, initialZoom: 14, interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate)),
          children: [
            TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', userAgentPackageName: 'id.siagaku.app'),
            MarkerLayer(markers: [
              for (final i in list)
                Marker(
                  point: LatLng(i.lat, i.lng),
                  width: 44, height: 44,
                  child: GestureDetector(
                    onTap: () => _sheet(i),
                    child: Container(
                      decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white, border: Border.all(color: _color(i), width: 2.5), boxShadow: shadowMd),
                      child: Icon(iconForCategory(i.category), size: 22, color: _color(i)),
                    ),
                  ),
                ),
              if (me != null)
                Marker(
                  point: LatLng(me!.lat, me!.lng),
                  width: 28, height: 28,
                  child: Container(decoration: BoxDecoration(shape: BoxShape.circle, color: C.primary, border: Border.all(color: Colors.white, width: 3), boxShadow: shadowMd)),
                ),
            ]),
            const RichAttributionWidget(attributions: [TextSourceAttribution('© OpenStreetMap contributors')]),
          ],
        ),
      ),
      Positioned(
        top: 12, left: 16, right: 16,
        child: Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: .95), borderRadius: BorderRadius.circular(99), boxShadow: shadowMd),
          child: Row(children: [
            _seg(true, 'Peringatan Darurat', Icons.circle, C.emergency),
            _seg(false, 'Laporan Warga', Icons.groups_outlined, C.muted),
          ]),
        ),
      ),
      Positioned(
        right: 16, top: 76,
        child: FloatingActionButton.small(heroTag: 'loc', backgroundColor: Colors.white, foregroundColor: C.primary, onPressed: _load, child: const Icon(Icons.my_location)),
      ),
      DraggableScrollableSheet(
        initialChildSize: .32, minChildSize: .14, maxChildSize: .8,
        builder: (_, sc) => Container(
          decoration: BoxDecoration(color: Colors.white, borderRadius: const BorderRadius.vertical(top: Radius.circular(28)), boxShadow: shadowLg),
          child: ListView(controller: sc, padding: const EdgeInsets.fromLTRB(16, 10, 16, 24), children: [
            Center(child: Container(width: 36, height: 5, decoration: BoxDecoration(color: C.outline, borderRadius: BorderRadius.circular(3)))),
            const SizedBox(height: 14),
            Row(children: [
              Expanded(child: Text(sosMode ? 'Peringatan Aktif di Sekitar' : 'Laporan Warga di Sekitar', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(99)),
                child: Text('${list.length} Aktif', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: C.emergencyDark)),
              ),
            ]),
            const SizedBox(height: 12),
            if (loading) const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
            if (error != null)
              Container(
                margin: const EdgeInsets.symmetric(vertical: 8),
                padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
                decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(16)),
                child: Row(children: [
                  const Icon(Icons.wifi_off_rounded, color: C.emergencyDark, size: 20),
                  const SizedBox(width: 10),
                  Expanded(child: Text(error!, style: const TextStyle(color: C.emergencyDark, fontWeight: FontWeight.w500))),
                  TextButton.icon(
                    onPressed: _load,
                    icon: const Icon(Icons.refresh, size: 18),
                    label: const Text('Coba lagi'),
                    style: TextButton.styleFrom(foregroundColor: C.emergencyDark),
                  ),
                ]),
              ),
            if (!loading && error == null && list.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('Tidak ada data aktif dalam radius 5 km dalam 24 jam terakhir.', style: TextStyle(color: C.muted))),
            for (final i in list)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: AppCard(
                  color: C.primaryTint.withValues(alpha: .5),
                  onTap: () => controller.move(LatLng(i.lat, i.lng), 16),
                  child: Row(children: [
                    CircleAvatar(backgroundColor: Colors.white, child: Icon(iconForCategory(i.category), color: _color(i))),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(i.category, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                        Text('${distanceLabel(i.distanceKm)} • ${timeAgo(i.createdAt)}', style: const TextStyle(color: C.muted, fontSize: 13)),
                      ]),
                    ),
                    StatusChip(i.status),
                  ]),
                ),
              ),
            const SizedBox(height: 4),
            const Text('Lokasi dibulatkan ±100 m demi privasi pelapor.', style: TextStyle(fontSize: 12, color: C.muted)),
          ]),
        ),
      ),
    ]);
  }

  Widget _seg(bool value, String label, IconData icon, Color dot) {
    final sel = sosMode == value;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => sosMode = value),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(color: sel ? C.primaryTint : Colors.transparent, borderRadius: BorderRadius.circular(99)),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(icon, size: value ? 9 : 16, color: sel ? (value ? C.emergency : C.primary) : dot),
            const SizedBox(width: 6),
            Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: sel ? C.primary : C.muted)),
          ]),
        ),
      ),
    );
  }

  void _sheet(NearbyItem i) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            StatusChip(i.status),
            const SizedBox(height: 12),
            Text(i.category, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text('${distanceLabel(i.distanceKm)} dari Anda • ${timeAgo(i.createdAt)}', style: const TextStyle(color: C.muted)),
            if (i.address != null) ...[const SizedBox(height: 8), Text(i.address!)],
          ]),
        ),
      ),
    );
  }
}
