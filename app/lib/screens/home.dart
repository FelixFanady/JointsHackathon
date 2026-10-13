import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../api.dart';
import '../theme.dart';

const holdDuration = Duration(seconds: 3);

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.onOpenMap});
  final VoidCallback onOpenMap;
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with SingleTickerProviderStateMixin {
  late final AnimationController hold = AnimationController(vsync: this, duration: holdDuration);
  List<NearbyItem>? alerts;
  bool locationFailed = false;

  @override
  void initState() {
    super.initState();
    hold.addStatusListener((s) {
      if (s == AnimationStatus.completed) _triggered();
    });
    _loadNearby();
  }

  @override
  void dispose() {
    hold.dispose();
    super.dispose();
  }

  Future<void> _loadNearby() async {
    final (p, _) = await currentPlace();
    if (p == null) {
      if (mounted) setState(() { locationFailed = true; alerts = []; });
      return;
    }
    try {
      final items = await Api.nearby(p.lat, p.lng);
      if (mounted) setState(() => alerts = items.where((e) => e.kind == 'sos').toList());
    } catch (_) {
      if (mounted) setState(() => alerts = []);
    }
  }

  Future<void> _triggered() async {
    HapticFeedback.heavyImpact();
    hold.reset();
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: C.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (_) => const SosFlow(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final first = (session.name ?? '').split(' ').first;
    return RefreshIndicator(
      onRefresh: _loadNearby,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          Text('Halo, $first', style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700, letterSpacing: -.6)),
          const SizedBox(height: 28),
          Center(child: _SosButton(hold: hold)),
          const SizedBox(height: 16),
          const Center(child: Text('DARURAT', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: 2.5))),
          const SizedBox(height: 4),
          const Center(child: Text('Tahan 3 detik untuk mengirim', style: TextStyle(color: C.muted, fontSize: 16))),
          const SizedBox(height: 32),
          AppCard(
            onTap: widget.onOpenMap,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Expanded(child: Text('Status Sekitar', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
                Text(alerts == null ? 'Memuat…' : (alerts!.isEmpty ? 'Aman' : '${alerts!.length} aktif'),
                    style: const TextStyle(color: C.muted, fontWeight: FontWeight.w500)),
              ]),
              const SizedBox(height: 12),
              Row(children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: alerts?.isNotEmpty == true ? C.warnBg : C.primaryTint,
                  child: Icon(alerts?.isNotEmpty == true ? Icons.warning_amber_rounded : Icons.verified_outlined,
                      color: alerts?.isNotEmpty == true ? C.warnText : C.primary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    locationFailed
                        ? 'Aktifkan lokasi untuk melihat peringatan di sekitar Anda'
                        : alerts == null
                            ? 'Memeriksa area sekitar…'
                            : alerts!.isEmpty
                                ? 'Tidak ada peringatan aktif di sekitar Anda'
                                : '${alerts!.first.category} • ${distanceLabel(alerts!.first.distanceKm)} dari Anda',
                    style: const TextStyle(fontSize: 15),
                  ),
                ),
              ]),
            ]),
          ),
        ],
      ),
    );
  }
}

/// Hold-to-activate SOS (3 s) with a progress ring, per DESIGN.md.
class _SosButton extends StatelessWidget {
  const _SosButton({required this.hold});
  final AnimationController hold;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Tombol SOS darurat. Tahan 3 detik untuk mengirim.',
      child: Listener(
        onPointerDown: (_) {
          HapticFeedback.mediumImpact();
          hold.forward(from: 0);
        },
        onPointerUp: (_) => hold.reset(),
        onPointerCancel: (_) => hold.reset(),
        child: AnimatedBuilder(
          animation: hold,
          builder: (_, __) {
            final v = hold.value;
            return SizedBox(
              width: 260, height: 260,
              child: Stack(alignment: Alignment.center, children: [
                Container(
                  width: 260, height: 260,
                  decoration: BoxDecoration(shape: BoxShape.circle, color: C.emergency.withValues(alpha: .08 + .1 * v)),
                ),
                SizedBox(
                  width: 236, height: 236,
                  child: CircularProgressIndicator(value: v, strokeWidth: 8, color: C.emergencyDark, backgroundColor: Colors.transparent),
                ),
                Container(
                  width: 210, height: 210,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [C.emergencyDark, C.emergency]),
                    boxShadow: shadowLg,
                  ),
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    const Icon(Icons.warning_amber_rounded, size: 56, color: Colors.white),
                    const SizedBox(height: 4),
                    Text(v > 0 ? '${(holdDuration.inSeconds - v * holdDuration.inSeconds).ceil().clamp(1, 3)}' : 'SOS',
                        style: const TextStyle(fontSize: 42, fontWeight: FontWeight.w800, color: Colors.white)),
                  ]),
                ),
              ]),
            );
          },
        ),
      ),
    );
  }
}

/// Emergency flow: Foto (opsional) -> Jenis bencana -> Konfirmasi -> Terkirim.
class SosFlow extends StatefulWidget {
  const SosFlow({super.key});
  @override
  State<SosFlow> createState() => _SosFlowState();
}

class _SosFlowState extends State<SosFlow> {
  int step = 0; // 0 foto, 1 jenis, 2 konfirmasi, 3 terkirim
  String? photoB64;
  Uint8List? photoBytes;
  String? category;
  Place? place;
  String? locError;
  bool sending = false;
  String? error;

  @override
  void initState() {
    super.initState();
    _locate();
  }

  Future<void> _locate() async {
    final (p, e) = await currentPlace();
    if (mounted) setState(() { place = p; locError = e; });
  }

  Future<void> _pick(ImageSource src) async {
    try {
      final x = await ImagePicker().pickImage(source: src, maxWidth: 1280, imageQuality: 70);
      if (x == null) return;
      final b = await x.readAsBytes();
      setState(() { photoBytes = b; photoB64 = base64Encode(b); });
    } catch (_) {
      setState(() => error = 'Tidak dapat mengakses kamera/galeri. Anda tetap bisa melanjutkan tanpa foto.');
    }
  }

  Future<void> _send() async {
    if (place == null) {
      await _locate();
      if (place == null) { setState(() => error = locError ?? 'Lokasi belum tersedia.'); return; }
    }
    setState(() { sending = true; error = null; });
    try {
      await Api.sendSos(nik: session.nik!, lat: place!.lat, lng: place!.lng, category: category ?? 'Darurat', photoB64: photoB64);
      HapticFeedback.heavyImpact();
      if (mounted) setState(() => step = 3);
    } on ApiException catch (e) {
      setState(() => error = e.message);
    }
    if (mounted) setState(() => sending = false);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Column(children: [
        const SizedBox(height: 8),
        Container(width: 36, height: 5, decoration: BoxDecoration(color: C.outline, borderRadius: BorderRadius.circular(3))),
        if (step < 3)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
            child: Row(children: [
              Expanded(child: Text('Laporan Darurat • Langkah ${step + 1} dari 3', style: const TextStyle(fontWeight: FontWeight.w600))),
              IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
            ]),
          ),
        if (step < 3)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(children: [
              for (var i = 0; i < 3; i++)
                Expanded(child: Container(height: 4, margin: const EdgeInsets.only(right: 6), decoration: BoxDecoration(color: i <= step ? C.primary : C.primaryFixed, borderRadius: BorderRadius.circular(2)))),
            ]),
          ),
        Expanded(child: [_photoStep, _typeStep, _confirmStep, _doneStep][step]()),
      ]),
    );
  }

  Widget _foot({required Widget primary, Widget? secondary}) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Column(mainAxisSize: MainAxisSize.min, children: [primary, if (secondary != null) secondary]),
        ),
      );

  Widget _photoStep() => Column(children: [
        Expanded(
          child: ListView(padding: const EdgeInsets.all(16), children: [
            const Text('Tambahkan foto', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, letterSpacing: -.4)),
            const SizedBox(height: 6),
            const Text('Foto membantu petugas menilai situasi. Langkah ini opsional.', style: TextStyle(color: C.muted)),
            const SizedBox(height: 16),
            if (photoBytes != null)
              ClipRRect(borderRadius: BorderRadius.circular(20), child: Image.memory(photoBytes!, height: 240, fit: BoxFit.cover))
            else
              AppCard(
                padding: const EdgeInsets.symmetric(vertical: 40),
                child: const Column(children: [
                  Icon(Icons.photo_camera_outlined, size: 48, color: C.muted),
                  SizedBox(height: 8),
                  Text('Belum ada foto', style: TextStyle(color: C.muted)),
                ]),
              ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: OutlinedButton.icon(onPressed: () => _pick(ImageSource.camera), icon: const Icon(Icons.photo_camera), label: const Text('Kamera'))),
              const SizedBox(width: 12),
              Expanded(child: OutlinedButton.icon(onPressed: () => _pick(ImageSource.gallery), icon: const Icon(Icons.photo_library_outlined), label: const Text('Galeri'))),
            ]),
            if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: const TextStyle(color: C.emergency))),
          ]),
        ),
        _foot(
          primary: PrimaryButton(label: photoBytes == null ? 'Lewati' : 'Lanjutkan', icon: Icons.arrow_forward, onPressed: () => setState(() { step = 1; error = null; })),
        ),
      ]);

  Widget _typeStep() => Column(children: [
        Expanded(
          child: ListView(padding: const EdgeInsets.all(16), children: [
            const Text('Apa yang terjadi?', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, letterSpacing: -.4)),
            const SizedBox(height: 6),
            const Text('Pilih jenis kejadian yang paling sesuai agar unit tanggap terdekat dapat diprioritaskan.', style: TextStyle(color: C.muted)),
            const SizedBox(height: 12),
            _locationBanner(),
            for (final e in incidentCategories.entries) ...[
              const SizedBox(height: 16),
              Text(e.key, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: .8, color: C.muted)),
              const SizedBox(height: 8),
              GridView.count(
                crossAxisCount: 2, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 1.25,
                children: [for (final c in e.value) _CategoryTile(icon: c.$1, label: c.$2, desc: c.$3, selected: category == c.$2, onTap: () => setState(() => category = c.$2))],
              ),
            ],
          ]),
        ),
        _foot(
          primary: PrimaryButton(label: 'Lanjutkan ke Konfirmasi', icon: Icons.arrow_forward, onPressed: category == null ? null : () => setState(() => step = 2)),
          secondary: SecondaryButton(label: 'Kembali', onPressed: () => setState(() => step = 0)),
        ),
      ]);

  Widget _locationBanner() => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: C.primaryTint, borderRadius: BorderRadius.circular(16)),
        child: Row(children: [
          Icon(place != null ? Icons.my_location : Icons.location_searching, color: place != null ? C.primary : C.warnText),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              place != null ? 'GPS terkunci • ${place!.lat.toStringAsFixed(5)}, ${place!.lng.toStringAsFixed(5)}' : (locError ?? 'Mencari lokasi Anda…'),
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
            ),
          ),
          if (place == null && locError != null) TextButton(onPressed: _locate, child: const Text('Coba lagi')),
        ]),
      );

  Widget _confirmStep() => Column(children: [
        Expanded(
          child: ListView(padding: const EdgeInsets.all(16), children: [
            const Text('Konfirmasi laporan', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, letterSpacing: -.4)),
            const SizedBox(height: 16),
            AppCard(
              child: Column(children: [
                _row(Icons.person_outline, 'Pelapor', session.name ?? ''),
                const Divider(height: 24),
                _row(iconForCategory(category ?? ''), 'Jenis kejadian', category ?? '-'),
                const Divider(height: 24),
                _row(Icons.my_location, 'Lokasi', place != null ? '${place!.lat.toStringAsFixed(5)}, ${place!.lng.toStringAsFixed(5)}' : (locError ?? 'Mencari…')),
                const Divider(height: 24),
                _row(Icons.photo_camera_outlined, 'Foto', photoBytes != null ? 'Terlampir' : 'Tidak ada'),
              ]),
            ),
            if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: const TextStyle(color: C.emergency, fontWeight: FontWeight.w500))),
          ]),
        ),
        _foot(
          primary: PrimaryButton(label: 'Kirim Panggilan Darurat', color: C.emergency, loading: sending, onPressed: _send),
          secondary: SecondaryButton(label: 'Kembali', onPressed: sending ? null : () => setState(() => step = 1)),
        ),
      ]);

  Widget _row(IconData i, String k, String v) => Row(children: [
        Icon(i, color: C.primary),
        const SizedBox(width: 12),
        Text(k, style: const TextStyle(color: C.muted)),
        const Spacer(),
        Flexible(child: Text(v, textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w600))),
      ]);

  Widget _doneStep() => Column(children: [
        Expanded(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              const CircleAvatar(radius: 48, backgroundColor: C.okBg, child: Icon(Icons.check_rounded, size: 56, color: C.ok)),
              const SizedBox(height: 20),
              const Text('Laporan Diterima', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              const Text('Panggilan darurat Anda sudah masuk ke petugas. Tetap tenang dan berada di tempat aman.', textAlign: TextAlign.center, style: TextStyle(color: C.muted, fontSize: 16)),
            ]),
          ),
        ),
        _foot(primary: PrimaryButton(label: 'Selesai', onPressed: () => Navigator.pop(context))),
      ]);
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({required this.icon, required this.label, required this.desc, required this.selected, required this.onTap});
  final IconData icon;
  final String label, desc;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => AppCard(
        color: selected ? C.primaryFixed : Colors.white,
        onTap: onTap,
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(radius: 22, backgroundColor: selected ? C.primary : C.primaryTint, child: Icon(icon, color: selected ? Colors.white : C.primary)),
            const Spacer(),
            if (selected) const Icon(Icons.check_circle, color: C.primary),
          ]),
          const Spacer(),
          Text(label, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: selected ? C.primaryDark : C.text)),
          Text(desc, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: C.muted)),
        ]),
      );
}
