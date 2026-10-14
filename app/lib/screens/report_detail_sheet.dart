import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../api.dart';
import '../bmkg.dart';
import '../theme.dart';

/// Opens the "Detail Laporan" bottom sheet for one of the citizen's own reports.
Future<void> showReportDetail(BuildContext context, MyReport r) => _open(
      context,
      ReportDetailSheet(
        id: r.id, kind: r.kind, category: r.category, status: r.status, createdAt: r.createdAt,
        description: r.description, address: r.address, own: true, verifiedBy: r.verifiedBy,
      ),
    );

/// Opens the same sheet for a report near the citizen (anonymous: no name, no description, rounded location).
Future<void> showNearbyDetail(BuildContext context, NearbyItem i) => _open(
      context,
      ReportDetailSheet(
        id: i.id, kind: i.kind, category: i.category, status: i.status, createdAt: i.createdAt,
        address: i.address, own: false, distanceKm: i.distanceKm, lat: i.lat, lng: i.lng, verifiedBy: i.verifiedBy,
      ),
    );

Future<void> _open(BuildContext context, Widget sheet) => showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: C.surface,
      showDragHandle: false,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (_) => sheet,
    );

/// Layout follows stitch "detail_laporan": header card, progress timeline, description, location.
/// Only data the app really has is shown; steps without a known time show no time.
class ReportDetailSheet extends StatefulWidget {
  const ReportDetailSheet({
    super.key,
    required this.id,
    required this.kind,
    required this.category,
    required this.status,
    required this.createdAt,
    required this.own,
    this.description,
    this.address,
    this.distanceKm,
    this.lat,
    this.lng,
    this.verifiedBy,
  });
  final String id, kind, category, status, createdAt;
  final String? description, address, verifiedBy;
  final bool own; // true = the citizen's own report
  final double? distanceKm, lat, lng;
  @override
  State<ReportDetailSheet> createState() => _ReportDetailSheetState();
}

class _ReportDetailSheetState extends State<ReportDetailSheet> {
  bool copied = false;

  ReportDetailSheet get r => widget;
  bool get isSos => r.kind == 'sos';
  bool get isQuakeCategory {
    final c = r.category.toLowerCase();
    return c.contains('gempa') || c.contains('tsunami');
  }
  String get code => '${isSos ? 'SOS' : 'LW'}-${r.id.replaceAll('-', '').substring(0, 8).toUpperCase()}';

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: code));
    HapticFeedback.selectionClick();
    setState(() => copied = true);
    await Future.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => copied = false);
  }

  @override
  Widget build(BuildContext context) {
    // The server prefixes "[Membahayakan warga] " when the citizen ticked the danger option.
    var desc = (r.description ?? '').trim();
    final danger = desc.startsWith('[Membahayakan warga]');
    if (danger) desc = desc.substring('[Membahayakan warga]'.length).trim();
    final masked = desc.contains('disamarkan]');

    final sections = <Widget>[
      _header(),
      _progress(),
      if (isQuakeCategory && r.status != 'false')
        _QuakeCard(lat: r.lat, lng: r.lng, reportTime: DateTime.tryParse(r.createdAt) ?? DateTime.now(), tsunami: r.category.toLowerCase().contains('tsunami')),
      if (r.status != 'false') _SafetyCard(category: r.category),
      if (desc.isNotEmpty || danger) _description(desc, danger, masked),
      if (r.lat != null && r.lng != null) _miniMap(),
      if (r.address != null && r.address!.trim().isNotEmpty) _location(),
      if (r.own && r.status == 'false') _rejectedNote(),
      if (!r.own) _privacyNote(),
    ];

    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * .88),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        // Drag handle + title bar
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
          child: Column(children: [
            Container(width: 40, height: 5, decoration: BoxDecoration(color: C.outline, borderRadius: BorderRadius.circular(99))),
            const SizedBox(height: 14),
            Row(children: [
              Expanded(child: Text(r.own ? 'Detail Laporan' : 'Laporan di Sekitar', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
            ]),
          ]),
        ),
        Flexible(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: Column(children: [
              for (var i = 0; i < sections.length; i++)
                _Reveal(index: i, child: Padding(padding: const EdgeInsets.only(bottom: 12), child: sections[i])),
            ]),
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton.tonal(
                onPressed: () => Navigator.pop(context),
                style: FilledButton.styleFrom(backgroundColor: C.primaryFixed, foregroundColor: C.primaryDark, shape: const StadiumBorder()),
                child: const Text('Tutup', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
              ),
            ),
          ),
        ),
      ]),
    );
  }

  // ---------- Sections ----------

  Widget _header() {
    final tint = isSos ? const Color(0xFFFEE2E2) : C.primaryTint;
    final fg = isSos ? C.emergency : C.primary;
    return _Card(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 56, height: 56,
            decoration: BoxDecoration(color: tint, borderRadius: BorderRadius.circular(18)),
            child: Icon(isSos ? Icons.warning_amber_rounded : iconForCategory(r.category), color: fg, size: 30),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(r.category, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -.3)),
              const SizedBox(height: 2),
              Text(isSos ? 'Sinyal Darurat (SOS)' : 'Laporan Warga', style: TextStyle(color: fg, fontWeight: FontWeight.w600, fontSize: 14)),
            ]),
          ),
        ]),
        const SizedBox(height: 14),
        Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
          StatusChip(r.status),
          if (r.distanceKm != null)
            _pill(Icons.near_me_outlined, '${distanceLabel(r.distanceKm!)} dari Anda', C.primaryTint, C.primaryDark),
          if (r.own)
          Material(
            color: C.field,
            borderRadius: BorderRadius.circular(99),
            child: InkWell(
              borderRadius: BorderRadius.circular(99),
              onTap: _copy,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Text(code, style: const TextStyle(fontFamily: 'monospace', fontSize: 12, fontWeight: FontWeight.w600, color: C.text)),
                  const SizedBox(width: 6),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: Icon(copied ? Icons.check : Icons.copy_rounded, key: ValueKey(copied), size: 14, color: copied ? C.ok : C.muted),
                  ),
                ]),
              ),
            ),
          ),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          const Icon(Icons.event_outlined, size: 16, color: C.muted),
          const SizedBox(width: 6),
          Expanded(
            child: Text('Dilaporkan ${formatDateTime(r.createdAt)} • ${timeAgo(r.createdAt)}',
                style: const TextStyle(color: C.muted, fontSize: 13)),
          ),
        ]),
      ]),
    );
  }

  Widget _progress() {
    // Only steps the system actually records: the database knows "received" and the officer's verdict,
    // not whether a team is on site, so no "Ditindaklanjuti" claim is made here.
    final steps = switch (r.status) {
      // Verified automatically (AI + BMKG, no officer involved): say so, never claim an officer did it.
      'valid' when r.verifiedBy == 'otomatis' => const [
          _Step('Laporan Diterima', 'Masuk ke pusat komando SiagaKu', _S.done),
          _Step('Diverifikasi Otomatis', 'Dikonfirmasi AI dan data gempa BMKG, sedang ditinjau petugas', _S.done),
        ],
      'valid' => const [
          _Step('Laporan Diterima', 'Masuk ke pusat komando SiagaKu', _S.done),
          _Step('Diverifikasi Petugas', 'Petugas menyatakan kejadian ini benar terjadi', _S.done),
        ],
      'false' => const [
          _Step('Laporan Diterima', 'Masuk ke pusat komando SiagaKu', _S.done),
          _Step('Laporan Ditolak', 'Petugas tidak dapat memverifikasi kejadian ini', _S.rejected),
        ],
      _ => const [
          _Step('Laporan Diterima', 'Masuk ke pusat komando SiagaKu', _S.done),
          _Step('Diverifikasi Petugas', 'Sedang ditinjau oleh petugas', _S.active),
        ],
    };
    final badge = switch (r.status) {
      'valid' => ('Terverifikasi', C.okBg, C.ok),
      'false' => ('Ditolak', C.falseBg, C.falseFg),
      _ => ('Diproses', C.warnBg, C.warnText),
    };
    return _Card(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Expanded(child: Text('Progres Penanganan', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: badge.$2, borderRadius: BorderRadius.circular(99)),
            child: Text(badge.$1, style: TextStyle(color: badge.$3, fontSize: 12, fontWeight: FontWeight.w600)),
          ),
        ]),
        const SizedBox(height: 16),
        for (var i = 0; i < steps.length; i++)
          _TimelineRow(step: steps[i], last: i == steps.length - 1, time: i == 0 ? formatTime(r.createdAt) : null),
      ]),
    );
  }

  Widget _description(String desc, bool danger, bool masked) => _Card(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Deskripsi Kejadian', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
          if (desc.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(desc, style: const TextStyle(fontSize: 16, height: 1.5)),
          ],
          if (danger || masked) ...[
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 8, children: [
              if (danger) _pill(Icons.warning_amber_rounded, 'Membahayakan warga', const Color(0xFFFEE2E2), C.emergencyDark),
              if (masked) _pill(Icons.privacy_tip_outlined, 'Data pribadi disamarkan', C.primaryTint, C.primaryDark),
            ]),
          ],
        ]),
      );

  Widget _location() => _Card(
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(color: C.primaryTint, borderRadius: BorderRadius.circular(12)),
            child: const Icon(Icons.location_on_outlined, color: C.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Titik Lokasi', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(r.address!, style: const TextStyle(color: C.muted, height: 1.4)),
            ]),
          ),
        ]),
      );

  Widget _miniMap() {
    final p = LatLng(r.lat!, r.lng!);
    final color = isSos ? C.emergency : (r.status == 'valid' ? C.emergencyDark : C.warn);
    return _Card(
      padding: EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: SizedBox(
          height: 170,
          child: Stack(children: [
            FlutterMap(
              options: MapOptions(initialCenter: p, initialZoom: 15.5, interactionOptions: const InteractionOptions(flags: InteractiveFlag.none)),
              children: [
                TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', userAgentPackageName: 'id.siagaku.app'),
                // Location is rounded to ~100 m, so show an area, not an exact pin.
                CircleLayer(circles: [
                  CircleMarker(point: p, radius: 100, useRadiusInMeter: true, color: color.withValues(alpha: .18), borderColor: color, borderStrokeWidth: 2),
                ]),
                MarkerLayer(markers: [
                  Marker(
                    point: p, width: 44, height: 44,
                    child: Container(
                      decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white, border: Border.all(color: color, width: 2.5), boxShadow: shadowMd),
                      child: Icon(isSos ? Icons.warning_amber_rounded : iconForCategory(r.category), size: 22, color: color),
                    ),
                  ),
                ]),
              ],
            ),
            Positioned(
              left: 12, top: 12,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: .95), borderRadius: BorderRadius.circular(99), boxShadow: shadowSm),
                child: const Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.blur_circular, size: 14, color: C.primary),
                  SizedBox(width: 4),
                  Text('Perkiraan area ±100 m', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: C.primary)),
                ]),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _privacyNote() => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: C.primaryTint, borderRadius: BorderRadius.circular(20)),
        child: const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.privacy_tip_outlined, color: C.primary, size: 20),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Identitas pelapor dan isi laporan dirahasiakan. Lokasi dibulatkan ±100 m demi privasi warga.',
              style: TextStyle(color: C.text, fontSize: 13, height: 1.4),
            ),
          ),
        ]),
      );

  Widget _rejectedNote() => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: C.falseBg, borderRadius: BorderRadius.circular(20)),
        child: const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.info_outline, color: C.falseFg),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'Menurut Anda keputusan ini keliru? Kirim laporan baru dengan foto dan penjelasan yang lebih jelas agar petugas dapat memverifikasinya.',
              style: TextStyle(color: C.text, height: 1.4),
            ),
          ),
        ]),
      );

  Widget _pill(IconData icon, String label, Color bg, Color fg) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 15, color: fg),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600)),
        ]),
      );
}

// ---------- Building blocks ----------

/// "Info Gempa BMKG": the nearest quake BMKG recorded around the report's time and place.
/// Labelled as BMKG's nearest record, never as "the quake you reported".
class _QuakeCard extends StatefulWidget {
  const _QuakeCard({this.lat, this.lng, required this.reportTime, this.tsunami = false});
  final double? lat, lng; // null for the citizen's own reports -> use current GPS position
  final DateTime reportTime;
  final bool tsunami; // tsunami report: lead with BMKG's tsunami potential, not the magnitude
  @override
  State<_QuakeCard> createState() => _QuakeCardState();
}

class _QuakeCardState extends State<_QuakeCard> {
  late Future<Quake?> future = _find();

  Future<Quake?> _find() async {
    var lat = widget.lat, lng = widget.lng;
    if (lat == null || lng == null) {
      final (p, _) = await currentPlace();
      if (p == null) throw Exception('no location');
      lat = p.lat;
      lng = p.lng;
    }
    return Bmkg.nearestFor(lat: lat, lng: lng, reportTime: widget.reportTime);
  }

  @override
  Widget build(BuildContext context) => _Card(
        child: FutureBuilder<Quake?>(
          future: future,
          builder: (_, snap) {
            final ts = widget.tsunami;
            final head = Row(children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(color: ts ? C.primaryTint : const Color(0xFFFFEDD5), borderRadius: BorderRadius.circular(10)),
                child: Icon(ts ? Icons.tsunami : Icons.vibration, color: ts ? C.primary : const Color(0xFFC2410C), size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(child: Text(ts ? 'Status Tsunami BMKG' : 'Info Gempa BMKG', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700))),
              const Text('Sumber: BMKG', style: TextStyle(fontSize: 11, color: C.muted, fontWeight: FontWeight.w600)),
            ]);

            if (snap.connectionState != ConnectionState.done) {
              return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                head,
                const SizedBox(height: 14),
                Row(children: [
                  const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                  const SizedBox(width: 10),
                  Text(ts ? 'Memeriksa peringatan tsunami BMKG…' : 'Memeriksa catatan gempa BMKG…', style: const TextStyle(color: C.muted)),
                ]),
              ]);
            }

            if (snap.hasError) {
              return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                head,
                const SizedBox(height: 10),
                Row(children: [
                  const Expanded(child: Text('Data BMKG belum dapat dimuat.', style: TextStyle(color: C.muted))),
                  TextButton.icon(
                    onPressed: () => setState(() => future = _find()),
                    icon: const Icon(Icons.refresh, size: 18),
                    label: const Text('Coba lagi'),
                  ),
                ]),
              ]);
            }

            final q = snap.data;
            if (q == null) {
              return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                head,
                const SizedBox(height: 10),
                Text(
                  ts
                      // Never imply "no tsunami": absence of a BMKG record is not proof of safety.
                      ? 'BMKG tidak mencatat gempa pemicu tsunami di sekitar lokasi ini pada waktu laporan. Tetap jauhi pantai dan ikuti arahan petugas atau BPBD.'
                      : 'BMKG belum mencatat gempa di sekitar lokasi ini pada waktu laporan. Gempa kecil mungkin belum masuk daftar BMKG.',
                  style: const TextStyle(color: C.muted, height: 1.4),
                ),
              ]);
            }

            final strong = q.magnitude >= 5;
            final magColor = q.magnitude >= 6 ? C.emergencyDark : (strong ? const Color(0xFFC2410C) : C.warnText);
            // BMKG reports in WIB; show WIB regardless of the phone's time zone.
            final w = q.time.toUtc().add(const Duration(hours: 7));
            final wib = '${w.day} ${_months[w.month - 1]} ${w.year}, ${w.hour.toString().padLeft(2, '0')}.${w.minute.toString().padLeft(2, '0')} WIB';
            final potentialBanner = q.potential.isEmpty
                ? const SizedBox.shrink()
                : Container(
                    width: double.infinity,
                    padding: EdgeInsets.symmetric(horizontal: 12, vertical: ts ? 14 : 10),
                    decoration: BoxDecoration(color: q.tsunamiRisk ? const Color(0xFFFEE2E2) : C.okBg, borderRadius: BorderRadius.circular(ts ? 16 : 12)),
                    child: Row(children: [
                      Icon(q.tsunamiRisk ? Icons.tsunami : Icons.check_circle_outline, size: ts ? 26 : 18, color: q.tsunamiRisk ? C.emergencyDark : C.ok),
                      SizedBox(width: ts ? 12 : 8),
                      Expanded(
                        child: Text(q.potential,
                            style: TextStyle(fontWeight: FontWeight.w700, fontSize: ts ? 16 : 13, color: q.tsunamiRisk ? C.emergencyDark : C.ok)),
                      ),
                    ]),
                  );
            return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              head,
              const SizedBox(height: 4),
              Text(
                ts
                    ? 'Tsunami umumnya dipicu gempa di laut. Ini gempa terdekat yang tercatat BMKG beserta status potensi tsunaminya.'
                    : 'Gempa terdekat yang tercatat BMKG di sekitar waktu laporan',
                style: const TextStyle(fontSize: 12, color: C.muted, height: 1.35),
              ),
              const SizedBox(height: 14),
              // For a tsunami report the tsunami status is the headline.
              if (ts) ...[potentialBanner, const SizedBox(height: 14)],
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                // Magnitude badge
                Container(
                  width: 84, padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(color: magColor.withValues(alpha: .1), borderRadius: BorderRadius.circular(16), border: Border.all(color: magColor.withValues(alpha: .3))),
                  child: Column(children: [
                    Text(q.magnitude.toStringAsFixed(1), style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: magColor, height: 1)),
                    const SizedBox(height: 2),
                    Text('Magnitudo', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: magColor)),
                  ]),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    _fact(Icons.place_outlined, q.region),
                    _fact(Icons.schedule, wib),
                    _fact(Icons.south, 'Kedalaman ${q.depth}'),
                    _fact(Icons.near_me_outlined, '${q.distanceKm.round()} km dari lokasi laporan'),
                  ]),
                ),
              ]),
              const SizedBox(height: 12),
              // Tsunami potential: BMKG's own wording.
              if (!ts) potentialBanner,
              if (q.felt.isNotEmpty && q.felt != '-') ...[
                const SizedBox(height: 8),
                Text('Dirasakan: ${q.felt}', style: const TextStyle(fontSize: 13, color: C.muted, height: 1.4)),
              ],
            ]);
          },
        ),
      );

  Widget _fact(IconData i, String t) => Padding(
        padding: const EdgeInsets.only(bottom: 5),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(i, size: 15, color: C.muted),
          const SizedBox(width: 6),
          Expanded(child: Text(t, style: const TextStyle(fontSize: 13, height: 1.3))),
        ]),
      );
}

/// "Yang perlu Anda lakukan": safety advice per incident type, plus national emergency numbers.
class _SafetyCard extends StatelessWidget {
  const _SafetyCard({required this.category});
  final String category;

  static List<String> tipsFor(String c) {
    final k = c.toLowerCase();
    if (k.contains('tsunami')) {
      return ['Segera menjauh dari pantai menuju tempat tinggi.', 'Jangan menunggu air laut surut untuk melihat.', 'Jangan kembali sebelum ada pernyataan aman dari BMKG/BPBD.'];
    }
    if (k.contains('gempa')) {
      return [
        'Waspada gempa susulan. Jauhi bangunan retak, kaca, dan tiang listrik.',
        'Jika di pantai dan guncangan kuat atau lama, segera ke tempat tinggi.',
        'Periksa kebocoran gas dan matikan listrik bila bangunan rusak.',
        'Ikuti info resmi BMKG/BPBD, jangan sebarkan kabar yang belum pasti.',
      ];
    }
    if (k.contains('banjir')) {
      return ['Matikan listrik dan pindahkan barang penting ke tempat tinggi.', 'Hindari berjalan atau berkendara melewati arus air.', 'Siapkan tas siaga: dokumen, obat, senter, air minum.'];
    }
    if (k.contains('kebakaran')) {
      return ['Segera keluar dan menjauh dari sumber api.', 'Tutup hidung dengan kain basah, tetap merunduk di bawah asap.', 'Jangan gunakan lift. Hubungi Damkar 113.'];
    }
    if (k.contains('longsor')) {
      return ['Jauhi lereng dan tebing di sekitar lokasi.', 'Waspada longsor susulan, terutama saat hujan.', 'Beri tahu warga lain agar tidak melintas.'];
    }
    if (k.contains('curi') || k.contains('jambret') || k.contains('rampok')) {
      return ['Jangan mengejar atau melawan pelaku.', 'Simpan bukti: foto, rekaman CCTV, ciri-ciri pelaku.', 'Hubungi Polisi 110 untuk pelaporan resmi.'];
    }
    return ['Tetap tenang dan cari tempat yang aman.', 'Ikuti arahan petugas di lokasi.', 'Bantu warga rentan: lansia, anak-anak, dan penyandang disabilitas.'];
  }

  @override
  Widget build(BuildContext context) {
    final tips = tipsFor(category);
    return _Card(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(color: C.okBg, borderRadius: BorderRadius.circular(10)),
            child: const Icon(Icons.health_and_safety_outlined, color: C.ok, size: 20),
          ),
          const SizedBox(width: 10),
          const Expanded(child: Text('Yang perlu Anda lakukan', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700))),
        ]),
        const SizedBox(height: 12),
        for (var i = 0; i < tips.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              CircleAvatar(
                radius: 11,
                backgroundColor: C.primaryTint,
                child: Text('${i + 1}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: C.primary)),
              ),
              const SizedBox(width: 10),
              Expanded(child: Text(tips[i], style: const TextStyle(fontSize: 14, height: 1.4))),
            ]),
          ),
        const Divider(height: 18),
        const Text('Nomor darurat', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: .4, color: C.muted)),
        const SizedBox(height: 8),
        const Wrap(spacing: 8, runSpacing: 8, children: [
          _NumChip('112', 'Darurat'),
          _NumChip('110', 'Polisi'),
          _NumChip('113', 'Damkar'),
          _NumChip('119', 'Ambulans'),
        ]),
      ]),
    );
  }
}

class _NumChip extends StatelessWidget {
  const _NumChip(this.number, this.label);
  final String number, label;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(color: C.field, borderRadius: BorderRadius.circular(99)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Text(number, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: C.emergencyDark)),
          const SizedBox(width: 4),
          Text(label, style: const TextStyle(fontSize: 12, color: C.text)),
        ]),
      );
}

class _Card extends StatelessWidget {
  const _Card({required this.child, this.padding = const EdgeInsets.all(18)});
  final Widget child;
  final EdgeInsets padding;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: padding,
        decoration: BoxDecoration(color: C.card, borderRadius: BorderRadius.circular(20), boxShadow: shadowSm),
        child: child,
      );
}

enum _S { done, active, upcoming, rejected }

class _Step {
  const _Step(this.title, this.subtitle, this.state);
  final String title, subtitle;
  final _S state;
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({required this.step, required this.last, this.time});
  final _Step step;
  final bool last;
  final String? time;

  @override
  Widget build(BuildContext context) {
    final s = step.state;
    final color = switch (s) { _S.done => C.primary, _S.active => C.primary, _S.rejected => C.falseFg, _S.upcoming => C.outline };
    final dot = switch (s) {
      _S.done => const CircleAvatar(radius: 13, backgroundColor: C.primary, child: Icon(Icons.check, size: 16, color: Colors.white)),
      _S.rejected => const CircleAvatar(radius: 13, backgroundColor: C.falseFg, child: Icon(Icons.close, size: 16, color: Colors.white)),
      _S.active => const _PulseDot(),
      _S.upcoming => const CircleAvatar(radius: 13, backgroundColor: C.field, child: Icon(Icons.hourglass_empty, size: 14, color: C.muted)),
    };
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(
          width: 28,
          child: Column(children: [
            dot,
            if (!last)
              Expanded(
                child: Container(
                  width: 2,
                  margin: const EdgeInsets.symmetric(vertical: 4),
                  color: s == _S.done ? C.primary : C.outline.withValues(alpha: .6),
                ),
              ),
          ]),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(bottom: last ? 0 : 18, top: 3),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(
                  child: Text(step.title,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: s == _S.upcoming ? C.muted : (s == _S.active ? C.primary : C.text),
                      )),
                ),
                if (time != null) Text(time!, style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w600)),
              ]),
              const SizedBox(height: 2),
              Text(step.subtitle, style: const TextStyle(fontSize: 13, color: C.muted, height: 1.35)),
            ]),
          ),
        ),
      ]),
    );
  }
}

/// The current step's dot gently pulses so the citizen sees work is in progress.
class _PulseDot extends StatefulWidget {
  const _PulseDot();
  @override
  State<_PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<_PulseDot> with SingleTickerProviderStateMixin {
  late final AnimationController c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));

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
  Widget build(BuildContext context) => SizedBox(
        width: 26, height: 26,
        child: AnimatedBuilder(
          animation: c,
          builder: (_, __) => Stack(alignment: Alignment.center, clipBehavior: Clip.none, children: [
            Container(
              width: 26 + 14 * c.value, height: 26 + 14 * c.value,
              decoration: BoxDecoration(shape: BoxShape.circle, color: C.primary.withValues(alpha: .25 * (1 - c.value))),
            ),
            const CircleAvatar(radius: 13, backgroundColor: C.primary, child: Icon(Icons.more_horiz, size: 16, color: Colors.white)),
          ]),
        ),
      );
}

/// Staggered fade + slide-up for each section when the sheet opens.
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
      builder: (_, v, c) => Opacity(opacity: v, child: Transform.translate(offset: Offset(0, 16 * (1 - v)), child: c)),
    );
  }
}

// ---------- Date helpers (no extra package needed) ----------

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

String formatTime(String iso) {
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return '';
  return '${d.hour.toString().padLeft(2, '0')}.${d.minute.toString().padLeft(2, '0')}';
}

String formatDateTime(String iso) {
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return '';
  return '${d.day} ${_months[d.month - 1]} ${d.year}, ${formatTime(iso)}';
}
