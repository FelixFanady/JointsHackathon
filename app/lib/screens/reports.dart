import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';

import '../api.dart';
import '../auto_refresh.dart';
import '../theme.dart';
import 'report_detail_sheet.dart';
import '../widgets/sent_view.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});
  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> with WidgetsBindingObserver, AutoRefresh {
  int tab = 0;
  List<MyReport>? mine;
  List<NearbyItem>? around;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  // Silent refresh (every 20 s while visible, and right after a new SOS/report): no error reset, no spinner.
  @override
  Future<void> autoRefresh() async {
    final nik = session.nik;
    if (nik == null) return;
    final m = await Api.myReports(nik);
    if (mounted) setState(() { mine = m; error = null; });
    final p = await recentPlace();
    if (p == null) return;
    final n = await Api.nearby(p.lat, p.lng);
    if (mounted) setState(() => around = n.where((e) => e.kind == 'report').toList());
  }

  Future<void> _load() async {
    setState(() => error = null);
    try {
      final m = await Api.myReports(session.nik!);
      if (mounted) setState(() => mine = m);
    } on ApiException catch (e) {
      if (mounted) setState(() { error = e.message; mine ??= []; });
    }
    final (p, _) = await currentPlace();
    if (p != null) {
      rememberPlace(p);
      try {
        final n = await Api.nearby(p.lat, p.lng);
        if (mounted) setState(() => around = n.where((e) => e.kind == 'report').toList());
      } catch (_) {
        if (mounted) setState(() => around ??= []);
      }
    } else if (mounted) {
      setState(() => around ??= []);
    }
  }

  Future<void> _create() async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => const CreateReportScreen()));
    if (ok == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          const Text('Laporan Warga', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w700, letterSpacing: -.6)),
          const SizedBox(height: 16),
          PrimaryButton(label: 'Buat Laporan Baru', icon: Icons.add, onPressed: _create, color: C.primaryDark),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(color: C.field, borderRadius: BorderRadius.circular(14)),
            child: Row(children: [
              _tab(0, 'Laporan Saya', mine?.length),
              _tab(1, 'Sekitar Saya', around?.length),
            ]),
          ),
          const SizedBox(height: 16),
          if (error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(error!, style: const TextStyle(color: C.emergency))),
          if (tab == 0) ..._mineList() else ..._aroundList(),
        ],
      ),
    );
  }

  Widget _tab(int i, String label, int? count) => Expanded(
        child: GestureDetector(
          onTap: () => setState(() => tab = i),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(color: tab == i ? Colors.white : Colors.transparent, borderRadius: BorderRadius.circular(11), boxShadow: tab == i ? shadowSm : null),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Text(label, style: TextStyle(fontWeight: FontWeight.w600, color: tab == i ? C.text : C.muted)),
              if (count != null) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                  decoration: BoxDecoration(color: C.field, borderRadius: BorderRadius.circular(99)),
                  child: Text('$count', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                ),
              ],
            ]),
          ),
        ),
      );

  List<Widget> _mineList() {
    if (mine == null) return [const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()))];
    if (mine!.isEmpty) return [_empty('Belum ada laporan', 'Laporan yang Anda kirim akan muncul di sini.')];
    return [
      for (final r in mine!)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: AppCard(
            onTap: () => _detail(r),
            child: Row(children: [
              CircleAvatar(radius: 24, backgroundColor: r.kind == 'sos' ? const Color(0xFFFEE2E2) : C.primaryTint, child: Icon(r.kind == 'sos' ? Icons.warning_amber_rounded : iconForCategory(r.category), color: r.kind == 'sos' ? C.emergency : C.primary)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(r.kind == 'sos' ? 'SOS • ${r.category}' : r.category, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  const SizedBox(height: 2),
                  Text(timeAgo(r.createdAt), style: const TextStyle(color: C.muted, fontSize: 13)),
                ]),
              ),
              StatusChip(r.status),
            ]),
          ),
        ),
    ];
  }

  List<Widget> _aroundList() {
    if (around == null) return [const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()))];
    if (around!.isEmpty) return [_empty('Belum ada laporan di sekitar', 'Laporan warga dalam radius 5 km akan muncul di sini. Pastikan lokasi aktif.')];
    return [
      for (final r in around!)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: AppCard(
            onTap: () => showNearbyDetail(context, r),
            child: Row(children: [
              CircleAvatar(radius: 24, backgroundColor: C.primaryTint, child: Icon(iconForCategory(r.category), color: C.primary)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(r.category, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  Text('${distanceLabel(r.distanceKm)} • ${timeAgo(r.createdAt)}', style: const TextStyle(color: C.muted, fontSize: 13)),
                ]),
              ),
              StatusChip(r.status),
            ]),
          ),
        ),
    ];
  }

  Widget _empty(String t, String s) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 16),
        child: Column(children: [
          const CircleAvatar(radius: 40, backgroundColor: C.primaryTint, child: Icon(Icons.inbox_outlined, size: 40, color: C.primary)),
          const SizedBox(height: 16),
          Text(t, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(s, textAlign: TextAlign.center, style: const TextStyle(color: C.muted)),
        ]),
      );

  void _detail(MyReport r) => showReportDetail(context, r);
}

/// Buat Laporan: 1 Jenis -> 2 Penjelasan -> 3 Foto -> 4 Konfirmasi.
class CreateReportScreen extends StatefulWidget {
  const CreateReportScreen({super.key});
  @override
  State<CreateReportScreen> createState() => _CreateReportScreenState();
}

class _CreateReportScreenState extends State<CreateReportScreen> {
  int step = 0;
  String? category;
  final desc = TextEditingController();
  bool? danger;
  Uint8List? photoBytes;
  String? photoB64;
  Place? place;
  String? locError;
  bool sending = false;
  String? error;

  @override
  void initState() {
    super.initState();
    _locate();
  }

  @override
  void dispose() {
    desc.dispose();
    super.dispose();
  }

  Future<void> _locate() async {
    final (p, e) = await currentPlace();
    if (mounted) setState(() { place = p; locError = e; });
  }

  bool get canNext => switch (step) {
        0 => category != null,
        1 => desc.text.trim().length >= 10 && danger != null,
        _ => true,
      };

  Future<void> _pick(ImageSource src) async {
    try {
      final x = await ImagePicker().pickImage(source: src, maxWidth: 1280, imageQuality: 70);
      if (x == null) return;
      final b = await x.readAsBytes();
      setState(() { photoBytes = b; photoB64 = base64Encode(b); });
    } catch (_) {
      setState(() => error = 'Tidak dapat mengakses kamera/galeri.');
    }
  }

  Future<void> _send() async {
    if (place == null) await _locate();
    if (place == null) { setState(() => error = locError ?? 'Lokasi belum tersedia.'); return; }
    setState(() { sending = true; error = null; });
    try {
      await Api.sendReport(
        nik: session.nik!, lat: place!.lat, lng: place!.lng, category: category!,
        description: desc.text.trim(), danger: danger ?? false, photoB64: photoB64,
      );
      if (!mounted) return;
      // Same "sent" screen as after an SOS (widgets/sent_view.dart). Replacing this form means
      // "Selesai" returns straight to the reports list, which receives `true` and refreshes.
      Navigator.of(context).pushReplacement<void, bool>(
        MaterialPageRoute(
          builder: (ctx) => Scaffold(
            backgroundColor: C.surface,
            body: SafeArea(
              child: SentView(
                title: 'Laporan Diterima',
                message: 'Laporan Anda sudah masuk ke petugas dan akan segera diverifikasi. Pantau statusnya di tab Laporan Saya.',
                onDone: () => Navigator.pop(ctx),
              ),
            ),
          ),
        ),
        result: true,
      );
      return;
    } on ApiException catch (e) {
      setState(() => error = e.message);
    }
    if (mounted) setState(() => sending = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Icons.arrow_back_ios_new, color: C.primary), onPressed: () => step == 0 ? Navigator.pop(context) : setState(() => step--)),
        title: const Text('Buat Laporan'),
        centerTitle: true,
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(children: [
            Row(children: [
              for (var i = 0; i < 4; i++)
                Expanded(child: Container(height: 4, margin: const EdgeInsets.only(right: 6), decoration: BoxDecoration(color: i <= step ? C.primary : C.primaryFixed, borderRadius: BorderRadius.circular(2)))),
            ]),
            const SizedBox(height: 6),
            Row(children: [Text('Langkah ${step + 1} dari 4', style: const TextStyle(fontSize: 12, color: C.muted)), const Spacer(), Text(['Jenis Kejadian', 'Penjelasan', 'Foto', 'Konfirmasi'][step], style: const TextStyle(fontSize: 12, color: C.muted))]),
          ]),
        ),
        Expanded(child: [_catStep, _descStep, _photoStep, _confirmStep][step]()),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              if (step < 3)
                PrimaryButton(label: step == 2 && photoBytes == null ? 'Lewati' : 'Lanjut', onPressed: canNext ? () => setState(() { step++; error = null; }) : null)
              else ...[
                PrimaryButton(label: 'Kirim Laporan', icon: Icons.send_rounded, loading: sending, onPressed: _send),
                const SizedBox(height: 6),
                const Text('Laporan langsung diteruskan ke petugas untuk diverifikasi.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: C.muted)),
              ],
              if (step > 0) SecondaryButton(label: 'Kembali', onPressed: sending ? null : () => setState(() => step--)),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _title(String t, String s) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(t, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700, letterSpacing: -.5)),
        const SizedBox(height: 6),
        Text(s, style: const TextStyle(color: C.muted, fontSize: 15)),
        const SizedBox(height: 16),
      ]);

  Widget _catStep() => ListView(padding: const EdgeInsets.all(16), children: [
        _title('Apa yang ingin dilaporkan?', 'Pilih jenis kejadian yang paling sesuai.'),
        for (final e in incidentCategories.entries) ...[
          Padding(padding: const EdgeInsets.only(top: 8, bottom: 8), child: Text(e.key, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: .8, color: C.muted))),
          for (final c in e.value)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: AppCard(
                color: category == c.$2 ? C.primaryFixed : Colors.white,
                onTap: () => setState(() => category = c.$2),
                child: Row(children: [
                  CircleAvatar(backgroundColor: category == c.$2 ? C.primary : C.primaryTint, child: Icon(c.$1, color: category == c.$2 ? Colors.white : C.primary)),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(c.$2, style: const TextStyle(fontWeight: FontWeight.w700)), Text(c.$3, style: const TextStyle(fontSize: 12, color: C.muted))])),
                  if (category == c.$2) const Icon(Icons.check_circle, color: C.primary),
                ]),
              ),
            ),
        ],
      ]);

  Widget _descStep() => ListView(padding: const EdgeInsets.all(16), children: [
        _title('Jelaskan Masalahnya', 'Ceritakan secara singkat apa yang terjadi di sekitar Anda.'),
        AppCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            TextField(
              controller: desc,
              minLines: 4,
              maxLines: 6,
              maxLength: 1000,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(hintText: 'Contoh: Ada pohon tumbang menghalangi jalan di depan balai RW'),
            ),
            const Row(children: [
              Icon(Icons.shield_outlined, size: 16, color: C.primary),
              SizedBox(width: 8),
              Expanded(child: Text('Nomor telepon dan email di dalam teks akan disamarkan otomatis untuk melindungi privasi Anda.', style: TextStyle(fontSize: 12, color: C.muted))),
            ]),
          ]),
        ),
        const SizedBox(height: 12),
        AppCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Apakah membahayakan warga?', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const Text('Pilih salah satu agar petugas tahu tingkat bahayanya', style: TextStyle(fontSize: 13, color: C.muted)),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: _yn(true, 'Ya', Icons.check_circle_outline)),
              const SizedBox(width: 12),
              Expanded(child: _yn(false, 'Tidak', Icons.highlight_off)),
            ]),
          ]),
        ),
      ]);

  Widget _yn(bool v, String label, IconData icon) {
    final sel = danger == v;
    return Material(
      color: sel ? C.primary : C.field,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => setState(() => danger = v),
        child: SizedBox(height: 48, child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(icon, size: 18, color: sel ? Colors.white : C.text), const SizedBox(width: 6), Text(label, style: TextStyle(fontWeight: FontWeight.w600, color: sel ? Colors.white : C.text))])),
      ),
    );
  }

  Widget _photoStep() => ListView(padding: const EdgeInsets.all(16), children: [
        _title('Tambahkan Foto', 'Opsional. Foto membantu petugas memverifikasi laporan.'),
        if (photoBytes != null)
          ClipRRect(borderRadius: BorderRadius.circular(20), child: Image.memory(photoBytes!, height: 260, fit: BoxFit.cover))
        else
          AppCard(padding: const EdgeInsets.symmetric(vertical: 48), child: const Center(child: Column(children: [Icon(Icons.add_a_photo_outlined, size: 48, color: C.muted), SizedBox(height: 8), Text('Belum ada foto', style: TextStyle(color: C.muted))]))),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: OutlinedButton.icon(onPressed: () => _pick(ImageSource.camera), icon: const Icon(Icons.photo_camera), label: const Text('Kamera'))),
          const SizedBox(width: 12),
          Expanded(child: OutlinedButton.icon(onPressed: () => _pick(ImageSource.gallery), icon: const Icon(Icons.photo_library_outlined), label: const Text('Galeri'))),
        ]),
        if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: const TextStyle(color: C.emergency))),
      ]);

  Widget _confirmStep() {
    final cat = category ?? '-';
    final isDanger = danger == true;
    var i = 0; // stagger index for the entrance animation
    Widget reveal(Widget w) => _Reveal(index: i++, child: w);
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 16), children: [
      // Hero: summary banner with completeness checklist
      reveal(_heroSummary(cat, isDanger)),
      const SizedBox(height: 14),
      reveal(Row(children: [
        const Text('Periksa detail laporan', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
        const Spacer(),
        Text('Ketuk Ubah untuk memperbaiki', style: TextStyle(fontSize: 12, color: C.muted.withValues(alpha: .9))),
      ])),
      const SizedBox(height: 10),

      // Description
      reveal(_ConfirmSection(
        title: 'Penjelasan',
        icon: Icons.notes_rounded,
        onEdit: () => setState(() => step = 1),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          decoration: BoxDecoration(
            color: C.field,
            borderRadius: BorderRadius.circular(14),
            border: const Border(left: BorderSide(color: C.primary, width: 3)),
          ),
          child: Text('"${desc.text.trim()}"', style: const TextStyle(fontSize: 15, height: 1.45, fontStyle: FontStyle.italic)),
        ),
      )),

      // Location with a small map preview
      reveal(_ConfirmSection(
        title: 'Lokasi Kejadian',
        icon: Icons.location_on_outlined,
        trailing: place != null
            ? const _MiniBadge(icon: Icons.gps_fixed, label: 'GPS terkunci', bg: C.okBg, fg: C.ok)
            : const _MiniBadge(icon: Icons.location_searching, label: 'Mencari…', bg: C.warnBg, fg: C.warnText),
        child: place != null
            ? ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: SizedBox(
                  height: 150,
                  child: Stack(children: [
                    FlutterMap(
                      options: MapOptions(initialCenter: LatLng(place!.lat, place!.lng), initialZoom: 16, interactionOptions: const InteractionOptions(flags: InteractiveFlag.none)),
                      children: [
                        TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', userAgentPackageName: 'id.siagaku.app'),
                        MarkerLayer(markers: [
                          Marker(point: LatLng(place!.lat, place!.lng), width: 90, height: 90, child: const _PulsePin()),
                        ]),
                      ],
                    ),
                    Positioned(
                      left: 10, bottom: 10,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(color: Colors.white.withValues(alpha: .95), borderRadius: BorderRadius.circular(99), boxShadow: shadowSm),
                        child: Text('${place!.lat.toStringAsFixed(5)}, ${place!.lng.toStringAsFixed(5)}',
                            style: const TextStyle(fontFamily: 'monospace', fontSize: 12, fontWeight: FontWeight.w600, color: C.text)),
                      ),
                    ),
                  ]),
                ),
              )
            : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(locError ?? 'Mencari lokasi Anda…', style: const TextStyle(color: C.warnText)),
                if (locError != null)
                  TextButton.icon(onPressed: _locate, icon: const Icon(Icons.refresh, size: 18), label: const Text('Coba lokasi lagi')),
              ]),
      )),

      // Photo
      reveal(_ConfirmSection(
        title: 'Foto Bukti',
        icon: Icons.photo_camera_outlined,
        onEdit: () => setState(() => step = 2),
        editLabel: photoBytes == null ? 'Tambah' : 'Ubah',
        trailing: photoBytes == null ? const _MiniBadge(icon: Icons.info_outline, label: 'Opsional', bg: C.field, fg: C.muted) : null,
        child: photoBytes != null
            ? ClipRRect(borderRadius: BorderRadius.circular(16), child: Image.memory(photoBytes!, height: 170, width: double.infinity, fit: BoxFit.cover))
            : Material(
                color: C.primaryTint.withValues(alpha: .6),
                borderRadius: BorderRadius.circular(16),
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: () => setState(() => step = 2),
                  child: const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16, horizontal: 14),
                    child: Row(children: [
                      Icon(Icons.add_a_photo_outlined, color: C.primary),
                      SizedBox(width: 12),
                      Expanded(
                        child: Text('Foto mempercepat verifikasi petugas. Ketuk untuk menambahkan.',
                            style: TextStyle(fontSize: 13, color: C.primaryDark, height: 1.35)),
                      ),
                    ]),
                  ),
                ),
              ),
      )),

      // Reporter + privacy
      reveal(_ConfirmSection(
        title: 'Pelapor',
        icon: Icons.person_outline,
        child: Column(children: [
          Row(children: [
            CircleAvatar(
              radius: 20,
              backgroundColor: C.primaryDark,
              child: Text(
                (session.name ?? '?').trim().isEmpty ? '?' : (session.name ?? '?').trim()[0].toUpperCase(),
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(session.name ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                Text('NIK ${maskNik(session.nik ?? '')}', style: const TextStyle(color: C.muted, fontSize: 13)),
              ]),
            ),
          ]),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: C.primaryTint, borderRadius: BorderRadius.circular(12)),
            child: const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(Icons.lock_outline, size: 16, color: C.primary),
              SizedBox(width: 8),
              Expanded(
                child: Text('Nama dan NIK hanya terlihat oleh petugas. Warga lain hanya melihat jenis kejadian dan perkiraan lokasi.',
                    style: TextStyle(fontSize: 12, height: 1.4, color: C.text)),
              ),
            ]),
          ),
        ]),
      )),
      if (error != null)
        Container(
          margin: const EdgeInsets.only(top: 4),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(16)),
          child: Row(children: [
            const Icon(Icons.error_outline, color: C.emergencyDark, size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(error!, style: const TextStyle(color: C.emergencyDark, fontWeight: FontWeight.w500))),
          ]),
        ),
    ]);
  }

  /// Blue gradient banner: what is being reported + a 4-item readiness checklist.
  Widget _heroSummary(String cat, bool isDanger) {
    final checks = <(String, bool, bool)>[
      // (label, done, optional)
      ('Jenis', category != null, false),
      ('Penjelasan', desc.text.trim().length >= 10, false),
      ('Lokasi', place != null, false),
      ('Foto', photoBytes != null, true),
    ];
    final ready = checks.where((c) => !c.$3).every((c) => c.$2);
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [C.primary, C.primaryDark]),
        boxShadow: [BoxShadow(color: C.primary.withValues(alpha: .3), blurRadius: 24, offset: const Offset(0, 10))],
      ),
      child: Stack(clipBehavior: Clip.none, children: [
        // Decorative soft circles
        Positioned(right: -30, top: -40, child: _blob(120, .10)),
        Positioned(right: 40, bottom: -50, child: _blob(80, .07)),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: .18), borderRadius: BorderRadius.circular(99)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(ready ? Icons.check_circle : Icons.pending_outlined, size: 14, color: Colors.white),
                const SizedBox(width: 4),
                Text(ready ? 'Siap dikirim' : 'Belum lengkap', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
              ]),
            ),
            const Spacer(),
            TextButton.icon(
              onPressed: () => setState(() => step = 0),
              icon: const Icon(Icons.edit_outlined, size: 16),
              label: const Text('Ubah'),
              style: TextButton.styleFrom(
                foregroundColor: Colors.white,
                backgroundColor: Colors.white.withValues(alpha: .14),
                visualDensity: VisualDensity.compact,
                shape: const StadiumBorder(),
                textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
              ),
            ),
          ]),
          const SizedBox(height: 14),
          Row(children: [
            Container(
              width: 60, height: 60,
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), boxShadow: shadowMd),
              child: Icon(iconForCategory(cat), color: C.primary, size: 32),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Laporan Warga', style: TextStyle(color: Colors.white.withValues(alpha: .8), fontSize: 13, fontWeight: FontWeight.w500)),
                Text(cat, style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -.4)),
              ]),
            ),
          ]),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(color: isDanger ? const Color(0xFFFFE4E4) : Colors.white.withValues(alpha: .18), borderRadius: BorderRadius.circular(99)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(isDanger ? Icons.warning_amber_rounded : Icons.shield_outlined, size: 14, color: isDanger ? C.emergencyDark : Colors.white),
              const SizedBox(width: 4),
              Text(isDanger ? 'Membahayakan warga' : 'Tidak membahayakan warga',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: isDanger ? C.emergencyDark : Colors.white)),
            ]),
          ),
          const SizedBox(height: 16),
          Container(height: 1, color: Colors.white.withValues(alpha: .18)),
          const SizedBox(height: 12),
          Row(children: [
            for (final c in checks)
              Expanded(
                child: Column(children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    width: 26, height: 26,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: c.$2 ? Colors.white : Colors.white.withValues(alpha: .14),
                      border: Border.all(color: Colors.white.withValues(alpha: .5)),
                    ),
                    child: Icon(c.$2 ? Icons.check : (c.$3 ? Icons.remove : Icons.close), size: 15, color: c.$2 ? C.primary : Colors.white),
                  ),
                  const SizedBox(height: 4),
                  Text(c.$1, style: TextStyle(color: Colors.white.withValues(alpha: c.$2 ? 1 : .7), fontSize: 11.5, fontWeight: FontWeight.w600)),
                  if (c.$3 && !c.$2) Text('opsional', style: TextStyle(color: Colors.white.withValues(alpha: .6), fontSize: 9.5)),
                ]),
              ),
          ]),
        ]),
      ]),
    );
  }

  Widget _blob(double size, double alpha) => IgnorePointer(
        child: Container(width: size, height: size, decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: alpha))),
      );
}

/// Red map pin with a soft pulsing ring (static when animations are disabled).
class _PulsePin extends StatefulWidget {
  const _PulsePin();
  @override
  State<_PulsePin> createState() => _PulsePinState();
}

class _PulsePinState extends State<_PulsePin> with SingleTickerProviderStateMixin {
  late final AnimationController c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.of(context).disableAnimations) {
      c.stop();
    } else if (!c.isAnimating) {
      c.repeat();
    }
  }

  @override
  void dispose() {
    c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: c,
        builder: (_, __) => Stack(alignment: Alignment.center, children: [
          Container(
            width: 24 + 60 * c.value, height: 24 + 60 * c.value,
            decoration: BoxDecoration(shape: BoxShape.circle, color: C.emergency.withValues(alpha: .28 * (1 - c.value))),
          ),
          Container(
            width: 22, height: 22,
            decoration: BoxDecoration(shape: BoxShape.circle, color: C.emergency, border: Border.all(color: Colors.white, width: 3), boxShadow: shadowMd),
          ),
        ]),
      );
}

/// Staggered fade + slide-up when the confirmation step opens.
class _Reveal extends StatelessWidget {
  const _Reveal({required this.index, required this.child});
  final int index;
  final Widget child;
  @override
  Widget build(BuildContext context) {
    if (MediaQuery.of(context).disableAnimations) return child;
    final ms = 320 + index * 70;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: Duration(milliseconds: ms),
      curve: Interval((index * 70) / ms, 1, curve: Curves.easeOutCubic),
      child: child,
      builder: (_, v, c) => Opacity(opacity: v, child: Transform.translate(offset: Offset(0, 18 * (1 - v)), child: c)),
    );
  }
}

/// White card used on the confirmation step: optional title row with icon and an "Ubah" link.
class _ConfirmSection extends StatelessWidget {
  const _ConfirmSection({required this.child, this.title, this.icon, this.onEdit, this.editLabel = 'Ubah', this.trailing});
  final Widget child;
  final String? title;
  final IconData? icon;
  final VoidCallback? onEdit;
  final String editLabel;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final edit = onEdit == null
        ? null
        : TextButton.icon(
            onPressed: onEdit,
            icon: const Icon(Icons.edit_outlined, size: 14),
            label: Text(editLabel),
            style: TextButton.styleFrom(
              foregroundColor: C.primary,
              backgroundColor: C.primaryTint,
              shape: const StadiumBorder(),
              visualDensity: VisualDensity.compact,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12.5),
            ),
          );
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.fromLTRB(16, 14, 10, 16),
      decoration: BoxDecoration(color: C.card, borderRadius: BorderRadius.circular(20), boxShadow: shadowSm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (title != null) ...[
          Row(children: [
            Icon(icon, size: 18, color: C.primary),
            const SizedBox(width: 8),
            Expanded(child: Text(title!, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
            if (trailing != null) Padding(padding: const EdgeInsets.only(right: 6), child: trailing),
            if (edit != null) edit,
          ]),
          const SizedBox(height: 10),
          Padding(padding: const EdgeInsets.only(right: 6), child: child),
        ] else
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: child), if (edit != null) edit]),
      ]),
    );
  }
}

class _MiniBadge extends StatelessWidget {
  const _MiniBadge({required this.icon, required this.label, required this.bg, required this.fg});
  final IconData icon;
  final String label;
  final Color bg, fg;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 12, color: fg),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: fg)),
        ]),
      );
}
