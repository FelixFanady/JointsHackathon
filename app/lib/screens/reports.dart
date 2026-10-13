import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api.dart';
import '../theme.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});
  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  int tab = 0;
  List<MyReport>? mine;
  List<NearbyItem>? around;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
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

  void _detail(MyReport r) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            StatusChip(r.status),
            const SizedBox(height: 12),
            Text(r.kind == 'sos' ? 'SOS • ${r.category}' : r.category, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(timeAgo(r.createdAt), style: const TextStyle(color: C.muted)),
            if (r.description != null && r.description!.isNotEmpty) ...[const SizedBox(height: 16), Text(r.description!, style: const TextStyle(fontSize: 16))],
            if (r.address != null) ...[const SizedBox(height: 12), Text(r.address!, style: const TextStyle(color: C.muted))],
            const SizedBox(height: 16),
          ]),
        ),
      ),
    );
  }
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
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Text('Laporan Diterima'),
          content: const Text('Terima kasih. Laporan Anda akan diverifikasi oleh petugas.'),
          actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Tutup'))],
        ),
      );
      if (mounted) Navigator.pop(context, true);
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
              else
                PrimaryButton(label: 'Kirim Laporan', loading: sending, onPressed: _send),
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

  Widget _confirmStep() => ListView(padding: const EdgeInsets.all(16), children: [
        _title('Konfirmasi Laporan', 'Periksa kembali sebelum dikirim.'),
        AppCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            _kv('Pelapor', session.name ?? ''),
            _kv('Jenis', category ?? '-'),
            _kv('Membahayakan warga', danger == true ? 'Ya' : 'Tidak'),
            _kv('Lokasi', place != null ? '${place!.lat.toStringAsFixed(5)}, ${place!.lng.toStringAsFixed(5)}' : (locError ?? 'Mencari lokasi…')),
            _kv('Foto', photoBytes != null ? 'Terlampir' : 'Tidak ada'),
            const Divider(height: 24),
            Text(desc.text.trim()),
          ]),
        ),
        if (place == null && locError != null) TextButton.icon(onPressed: _locate, icon: const Icon(Icons.refresh), label: const Text('Coba lokasi lagi')),
        if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: const TextStyle(color: C.emergency, fontWeight: FontWeight.w500))),
      ]);

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(k, style: const TextStyle(color: C.muted)),
          const Spacer(),
          Flexible(child: Text(v, textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w600))),
        ]),
      );
}
