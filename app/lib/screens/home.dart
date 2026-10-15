import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../api.dart';
import '../sos_sound.dart';
import '../theme.dart';
import '../widgets/sent_view.dart';
import '../widgets/area_status_banner.dart';

const holdDuration = Duration(seconds: 3);

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.onOpenNearby});
  final VoidCallback onOpenNearby;
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with SingleTickerProviderStateMixin {
  late final AnimationController hold = AnimationController(vsync: this, duration: holdDuration);
  final _statusKey = GlobalKey<AreaStatusCardState>();

  @override
  void initState() {
    super.initState();
    hold.addStatusListener((s) {
      if (s == AnimationStatus.completed) _triggered();
    });
  }

  @override
  void dispose() {
    hold.dispose();
    super.dispose();
  }

  Future<void> _triggered() async {
    HapticFeedback.heavyImpact();
    SosSound.play('alarm');
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
      onRefresh: () async => _statusKey.currentState?.refresh(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          Text('Halo, $first', style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700, letterSpacing: -.6)),
          const SizedBox(height: 12),
          Center(child: _SosButton(hold: hold)),
          const SizedBox(height: 8),
          const Center(child: Text('DARURAT', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: 2.5))),
          const SizedBox(height: 4),
          Center(
            child: AnimatedBuilder(
              animation: hold,
              builder: (_, __) => AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: Text(
                  hold.value > 0 ? 'Terus tahan… lepas untuk batal' : 'Tahan 3 detik untuk mengirim',
                  key: ValueKey(hold.value > 0),
                  style: TextStyle(
                    color: hold.value > 0 ? C.emergencyDark : C.muted,
                    fontSize: 16,
                    fontWeight: hold.value > 0 ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 32),
          AreaStatusCard(key: _statusKey, onOpen: widget.onOpenNearby),
        ],
      ),
    );
  }
}

class _SosButton extends StatefulWidget {
  const _SosButton({required this.hold});
  final AnimationController hold;
  @override
  State<_SosButton> createState() => _SosButtonState();
}

class _SosButtonState extends State<_SosButton> with SingleTickerProviderStateMixin {
  late final AnimationController idle = AnimationController(vsync: this, duration: const Duration(milliseconds: 2400));
  bool down = false;
  int lastSecond = -1;

  AnimationController get hold => widget.hold;

  @override
  void initState() {
    super.initState();
    hold.addListener(_onTick);
    SosSound.preload();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.of(context).disableAnimations) {
      idle.stop();
    } else if (!idle.isAnimating) {
      idle.repeat();
    }
  }

  @override
  void dispose() {
    hold.removeListener(_onTick);
    idle.dispose();
    super.dispose();
  }

  void _onTick() {
    if (!down || hold.value >= 1) return;
    final s = (hold.value * holdDuration.inSeconds).floor();
    if (s != lastSecond) {
      lastSecond = s;
      SosSound.play('beep${s + 1}');
      HapticFeedback.mediumImpact();
    }
  }

  void _press() {
    setState(() => down = true);
    lastSecond = -1;
    hold.forward(from: 0);
  }

  void _release() {
    if (!down) return;
    final cancelled = hold.value > 0 && hold.value < 1;
    setState(() => down = false);
    hold.reset();
    if (cancelled) SosSound.play('press');
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Tombol SOS darurat. Tahan 3 detik untuk mengirim.',
      child: Listener(
        onPointerDown: (_) => _press(),
        onPointerUp: (_) => _release(),
        onPointerCancel: (_) => _release(),
        child: AnimatedBuilder(
          animation: Listenable.merge([hold, idle]),
          builder: (_, __) {
            final v = hold.value;
            final t = idle.value;
            final pressed = down && v > 0;
            final still = MediaQuery.of(context).disableAnimations;
            final frac = (v * holdDuration.inSeconds) % 1;
            final pop = 1 + .18 * (1 - Curves.easeOut.transform(math.min(frac * 5, 1)));
            final remaining = (holdDuration.inSeconds - v * holdDuration.inSeconds).ceil().clamp(1, holdDuration.inSeconds);
            const face = 196.0;
            const lip = 7.0;

            return SizedBox(
              width: 300, height: 300,
              child: Stack(alignment: Alignment.center, children: [
                if (!down && !still)
                  IgnorePointer(
                    child: Container(
                      width: 252 + 44 * t, height: 252 + 44 * t,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: C.emergency.withValues(alpha: .22 * (1 - t)), width: 1.5),
                      ),
                    ),
                  ),
                Container(
                  width: 252, height: 252,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white,
                    border: Border.all(color: const Color(0xFFF3D9DA)),
                    boxShadow: [BoxShadow(color: const Color(0xFF14213D).withValues(alpha: .07), blurRadius: 28, offset: const Offset(0, 12))],
                  ),
                ),
                CustomPaint(size: const Size(230, 230), painter: _HoldRingPainter(v: v, pressed: pressed)),
                SizedBox(
                  width: face, height: face + lip,
                  child: Stack(children: [
                    Positioned(
                      left: 0, right: 0, bottom: 0,
                      child: Container(
                        height: face,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: const Color(0xFFA3101C),
                          boxShadow: [
                            BoxShadow(
                              color: C.emergencyDark.withValues(alpha: down ? .18 : .30),
                              blurRadius: down ? 10 : 22,
                              offset: Offset(0, down ? 4 : 12),
                            ),
                          ],
                        ),
                      ),
                    ),
                    AnimatedPositioned(
                      duration: Duration(milliseconds: down ? 70 : 160),
                      curve: Curves.easeOut,
                      left: 0, right: 0,
                      top: down ? lip - 1 : 0,
                      child: Container(
                        height: face,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: pressed
                                ? [Color.lerp(const Color(0xFFE23B3E), const Color(0xFFC81E28), v)!, Color.lerp(const Color(0xFFD5292F), const Color(0xFFB8141F), v)!]
                                : const [Color(0xFFEC4346), Color(0xFFDA2F33)],
                          ),
                          border: Border.all(color: Colors.white.withValues(alpha: .10), width: 1),
                        ),
                        alignment: Alignment.center,
                        child: pressed
                            ? Transform.scale(
                                scale: pop,
                                child: Text('$remaining',
                                    style: const TextStyle(fontSize: 76, height: 1, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: -1)),
                              )
                            : const Text('SOS',
                                style: TextStyle(fontSize: 56, height: 1, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: 3)),
                      ),
                    ),
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

class _HoldRingPainter extends CustomPainter {
  _HoldRingPainter({required this.v, required this.pressed});
  final double v;
  final bool pressed;

  static const _seconds = 3;
  static const _stroke = 8.0;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.width / 2 - _stroke / 2;
    final rect = Rect.fromCircle(center: c, radius: r);
    const start = -math.pi / 2;

    canvas.drawCircle(
      c, r,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = _stroke
        ..color = C.emergency.withValues(alpha: pressed ? .14 : .08),
    );
    if (v > 0) {
      canvas.drawArc(
        rect, start, 2 * math.pi * v, false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = _stroke
          ..strokeCap = StrokeCap.round
          ..color = C.emergencyDark,
      );
    }
    final tick = Paint()
      ..color = Colors.white
      ..strokeWidth = 2.5;
    for (var i = 0; i < _seconds; i++) {
      final a = start + i * 2 * math.pi / _seconds;
      final dir = Offset(math.cos(a), math.sin(a));
      canvas.drawLine(c + dir * (r - _stroke / 2 - 1), c + dir * (r + _stroke / 2 + 1), tick);
    }
  }

  @override
  bool shouldRepaint(_HoldRingPainter old) => old.v != v || old.pressed != pressed;
}

class SosFlow extends StatefulWidget {
  const SosFlow({super.key});
  @override
  State<SosFlow> createState() => _SosFlowState();
}

class _SosFlowState extends State<SosFlow> {
  int step = 0;
  String? photoB64;
  Uint8List? photoBytes;
  String? category;
  Place? place;
  String? address;
  bool addressLoading = false;
  String? locError;
  bool sending = false;
  String? sentCode;
  String? error;
  final otherCtrl = TextEditingController();

  static const otherCategory = 'Bencana Lainnya';
  bool get isOther => category == otherCategory;
  String get otherText => otherCtrl.text.trim();
  bool get typeReady => category != null && (!isOther || otherText.length >= 3);
  String get categoryLabel => isOther && otherText.isNotEmpty ? otherText : (category ?? '-');

  @override
  void dispose() {
    otherCtrl.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _locate();
  }

  Future<void> _locate() async {
    final (p, e) = await currentPlace();
    if (!mounted) return;
    setState(() { place = p; locError = e; address = null; addressLoading = p != null; });
    if (p == null) return;
    final a = await addressFor(p);
    if (mounted && place == p) setState(() { address = a; addressLoading = false; });
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
      sentCode = await Api.sendSos(
        nik: session.nik!, lat: place!.lat, lng: place!.lng, category: category ?? 'Darurat', photoB64: photoB64,
        description: isOther && otherText.isNotEmpty ? otherText : null,
        address: address,
      );
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
                children: [
                  for (final c in e.value)
                    _CategoryTile(
                      icon: c.$1, label: c.$2, desc: c.$3, selected: category == c.$2,
                      onTap: () {
                        setState(() => category = c.$2);
                        if (c.$2 != otherCategory) FocusScope.of(context).unfocus();
                      },
                    ),
                ],
              ),
              if (e.value.any((c) => c.$2 == otherCategory))
                AnimatedSize(
                  duration: const Duration(milliseconds: 250),
                  curve: Curves.easeOutCubic,
                  child: isOther ? _otherField() : const SizedBox(width: double.infinity),
                ),
            ],
          ]),
        ),
        _foot(
          primary: PrimaryButton(label: 'Lanjutkan ke Konfirmasi', icon: Icons.arrow_forward, onPressed: typeReady ? () { FocusScope.of(context).unfocus(); setState(() => step = 2); } : null),
          secondary: Padding(
            padding: const EdgeInsets.only(top: 14),
            child: SecondaryButton(label: 'Kembali', onPressed: () => setState(() => step = 0)),
          ),
        ),
      ]);

  static const _otherSuggestions = ['Angin puting beliung', 'Gunung meletus', 'Pohon tumbang', 'Kekeringan', 'Gelombang tinggi'];

  Widget _otherField() {
    final n = otherText.length;
    final tooShort = n > 0 && n < 3;
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: C.primaryFixed, width: 1.5),
        boxShadow: shadowMd,
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(color: C.primaryTint, borderRadius: BorderRadius.circular(12)),
            child: const Icon(Icons.edit_note_rounded, color: C.primary),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Bencana apa yang terjadi?', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              SizedBox(height: 2),
              Text('Tulis singkat agar petugas tahu bantuan yang dibutuhkan.', style: TextStyle(color: C.muted, fontSize: 12.5)),
            ]),
          ),
        ]),
        const SizedBox(height: 14),
        TextField(
          controller: otherCtrl,
          autofocus: true,
          maxLength: 60,
          textCapitalization: TextCapitalization.sentences,
          textInputAction: TextInputAction.done,
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) { if (typeReady) setState(() => step = 2); },
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
          buildCounter: (_, {required currentLength, required isFocused, maxLength}) => null,
          decoration: InputDecoration(
            hintText: 'Contoh: angin puting beliung',
            hintStyle: const TextStyle(color: C.muted, fontWeight: FontWeight.w400),
            filled: true,
            fillColor: C.field,
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            prefixIcon: const Icon(Icons.crisis_alert, color: C.primary, size: 20),
            suffixIcon: n == 0
                ? null
                : IconButton(
                    tooltip: 'Hapus',
                    icon: const Icon(Icons.cancel, size: 20, color: C.muted),
                    onPressed: () => setState(otherCtrl.clear),
                  ),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide(color: tooShort ? C.emergency : C.primary, width: 2),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Row(children: [
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: tooShort
                  ? const Text('Tulis minimal 3 huruf.', key: ValueKey('short'), style: TextStyle(color: C.emergency, fontSize: 12, fontWeight: FontWeight.w500))
                  : n >= 3
                      ? const Row(key: ValueKey('ok'), children: [
                          Icon(Icons.check_circle, size: 14, color: C.ok),
                          SizedBox(width: 4),
                          Text('Siap dikirim', style: TextStyle(color: C.ok, fontSize: 12, fontWeight: FontWeight.w600)),
                        ])
                      : const SizedBox.shrink(key: ValueKey('none')),
            ),
          ),
          Text('$n/60', style: const TextStyle(color: C.muted, fontSize: 12)),
        ]),
        const SizedBox(height: 10),
        const Text('Atau pilih cepat', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: .4, color: C.muted)),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final s in _otherSuggestions)
            _SuggestChip(
              label: s,
              selected: otherText.toLowerCase() == s.toLowerCase(),
              onTap: () {
                HapticFeedback.selectionClick();
                setState(() {
                  otherCtrl.text = s;
                  otherCtrl.selection = TextSelection.collapsed(offset: s.length);
                });
              },
            ),
        ]),
      ]),
    );
  }

  String get locationText {
    if (place == null) return locError ?? 'Mencari lokasi Anda…';
    if (address != null) return address!;
    return addressLoading ? 'Mencari alamat…' : 'Lokasi GPS terkunci (alamat tidak ditemukan)';
  }

  Widget _locationBanner() => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: C.primaryTint, borderRadius: BorderRadius.circular(16)),
        child: Row(children: [
          Icon(place != null ? Icons.my_location : Icons.location_searching, color: place != null ? C.primary : C.warnText),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              place != null ? 'GPS terkunci • $locationText' : locationText,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
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
            const SizedBox(height: 6),
            const Text('Periksa sekali lagi, lalu geser tombol di bawah untuk mengirim.', style: TextStyle(color: C.muted)),
            const SizedBox(height: 16),
            AppCard(
              child: Column(children: [
                _row(Icons.person_outline, 'Pelapor', session.name ?? ''),
                const Divider(height: 24),
                _row(iconForCategory(category ?? ''), 'Jenis kejadian', categoryLabel),
                const Divider(height: 24),
                _row(
                  Icons.location_on_outlined,
                  'Lokasi',
                  locationText,
                  muted: place == null || address == null,
                  trailing: place == null && locError != null
                      ? TextButton(onPressed: _locate, child: const Text('Coba lagi'))
                      : addressLoading
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : null,
                ),
                const Divider(height: 24),
                _row(Icons.photo_camera_outlined, 'Foto', photoBytes != null ? 'Terlampir' : 'Tidak ada', muted: photoBytes == null),
              ]),
            ),
            if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: const TextStyle(color: C.emergency, fontWeight: FontWeight.w500))),
          ]),
        ),
        _foot(
          primary: _SlideToSend(label: 'Geser untuk kirim SOS', loading: sending, onConfirmed: _send),
          secondary: Padding(
            padding: const EdgeInsets.only(top: 14),
            child: _BackButton(onPressed: sending ? null : () => setState(() => step = 1)),
          ),
        ),
      ]);

  Widget _row(IconData i, String k, String v, {bool muted = false, Widget? trailing}) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 40, height: 40,
          decoration: BoxDecoration(color: C.primaryTint, borderRadius: BorderRadius.circular(12)),
          child: Icon(i, color: C.primary, size: 22),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(k, style: const TextStyle(color: C.muted, fontSize: 13)),
            const SizedBox(height: 2),
            Text(v, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15, height: 1.3, color: muted ? C.muted : null)),
          ]),
        ),
        if (trailing != null) Padding(padding: const EdgeInsets.only(left: 8, top: 10), child: trailing),
      ]);

  Widget _doneStep() => SentView(
        title: 'Laporan Diterima',
        code: sentCode,
        message: 'Panggilan darurat Anda sudah masuk ke petugas. Tetap tenang dan berada di tempat aman.',
        onDone: () => Navigator.pop(context),
      );
}

class _SlideToSend extends StatefulWidget {
  const _SlideToSend({required this.label, required this.onConfirmed, this.loading = false});
  final String label;
  final VoidCallback onConfirmed;
  final bool loading;
  @override
  State<_SlideToSend> createState() => _SlideToSendState();
}

class _SlideToSendState extends State<_SlideToSend> with TickerProviderStateMixin {
  static const _h = 68.0, _pad = 6.0;
  late final AnimationController back = AnimationController(vsync: this, duration: const Duration(milliseconds: 360));
  late final AnimationController hint = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800));
  double drag = 0;
  double from = 0;
  bool dragging = false;
  bool done = false;

  @override
  void initState() {
    super.initState();
    back.addListener(() => setState(() => drag = (from * (1 - Curves.easeOutBack.transform(back.value))).clamp(0.0, 1.0)));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.of(context).disableAnimations) {
      hint.stop();
    } else if (!hint.isAnimating) {
      hint.repeat();
    }
  }

  @override
  void didUpdateWidget(covariant _SlideToSend old) {
    super.didUpdateWidget(old);
    if (old.loading && !widget.loading && done) {
      done = false;
      _springBack();
    }
  }

  @override
  void dispose() {
    back.dispose();
    hint.dispose();
    super.dispose();
  }

  void _springBack() {
    from = drag;
    back.forward(from: 0);
  }

  void _confirm() {
    if (done || widget.loading) return;
    setState(() { done = true; dragging = false; drag = 1; });
    HapticFeedback.heavyImpact();
    widget.onConfirmed();
  }

  @override
  Widget build(BuildContext context) {
    final busy = widget.loading || done;
    final ready = drag >= .85;
    return Semantics(
      button: true,
      label: widget.label,
      onTap: busy ? null : _confirm,
      child: SizedBox(
        width: double.infinity,
        height: _h,
        child: LayoutBuilder(builder: (context, c) {
          final thumb = _h - _pad * 2;
          final travel = (c.maxWidth - thumb - _pad * 2).clamp(1.0, double.infinity);
          final x = travel * drag;
          return GestureDetector(
            behavior: HitTestBehavior.opaque,
            onHorizontalDragStart: busy ? null : (_) { back.stop(); setState(() => dragging = true); },
            onHorizontalDragUpdate: busy
                ? null
                : (d) {
                    final v = (drag + d.delta.dx / travel).clamp(0.0, 1.0);
                    if ((v * 5).floor() != (drag * 5).floor()) HapticFeedback.selectionClick();
                    if (v >= .85 && drag < .85) HapticFeedback.mediumImpact();
                    setState(() => drag = v);
                  },
            onHorizontalDragEnd: busy ? null : (_) { setState(() => dragging = false); ready ? _confirm() : _springBack(); },
            child: AnimatedBuilder(
              animation: hint,
              builder: (_, __) => Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(_h / 2),
                  gradient: LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    colors: [Color.lerp(C.emergencyGlow, C.emergency, .35 + .65 * (1 - drag))!, Color.lerp(C.emergency, C.emergencyDark, .5 + .5 * drag)!],
                  ),
                  boxShadow: [
                    BoxShadow(color: C.emergency.withValues(alpha: .28 + .2 * drag), blurRadius: 20 + 10 * drag, offset: const Offset(0, 8)),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(_h / 2),
                  child: Stack(children: [
                    Positioned(
                      left: 0, right: 0, top: 0, height: _h / 2,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [Colors.white.withValues(alpha: .18), Colors.white.withValues(alpha: 0)],
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      left: _pad, top: _pad, bottom: _pad,
                      width: thumb + x,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: .16 + .1 * drag),
                          borderRadius: BorderRadius.circular(thumb / 2),
                        ),
                      ),
                    ),
                    Positioned.fill(
                      left: thumb + _pad + 6,
                      right: 14,
                      child: Opacity(
                        opacity: busy ? 1 : (1 - drag * 1.4).clamp(0.0, 1.0),
                        child: Center(
                          child: busy
                              ? const Text('Mengirim panggilan darurat…',
                                  maxLines: 1, overflow: TextOverflow.ellipsis,
                                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15))
                              : Row(mainAxisSize: MainAxisSize.min, children: [
                                  Flexible(
                                    child: ShaderMask(
                                      blendMode: BlendMode.srcIn,
                                      shaderCallback: (r) {
                                        final t = hint.value * 2 - .5;
                                        return LinearGradient(
                                          colors: const [Color(0xCCFFFFFF), Colors.white, Color(0xCCFFFFFF)],
                                          stops: [(t - .2).clamp(0.0, 1.0), t.clamp(0.0, 1.0), (t + .2).clamp(0.0, 1.0)],
                                        ).createShader(r);
                                      },
                                      child: Text(widget.label,
                                          maxLines: 1, overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15.5, letterSpacing: .2)),
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  for (var k = 0; k < 3; k++)
                                    Opacity(
                                      opacity: .35 + .65 * (1 - ((hint.value * 3 - k) % 3 - 1).abs().clamp(0.0, 1.0)),
                                      child: const Icon(Icons.chevron_right_rounded, color: Colors.white, size: 20),
                                    ),
                                ]),
                        ),
                      ),
                    ),
                    Positioned(
                      left: _pad + x,
                      top: _pad,
                      child: AnimatedScale(
                        scale: dragging ? 1.06 : 1,
                        duration: const Duration(milliseconds: 140),
                        child: Container(
                          width: thumb, height: thumb,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white.withValues(alpha: .6), width: 3),
                            boxShadow: [BoxShadow(color: C.emergencyDark.withValues(alpha: .35), blurRadius: 10, offset: const Offset(0, 3))],
                          ),
                          child: AnimatedSwitcher(
                            duration: const Duration(milliseconds: 180),
                            transitionBuilder: (w, a) => ScaleTransition(scale: a, child: w),
                            child: busy
                                ? const Padding(key: ValueKey('busy'), padding: EdgeInsets.all(15), child: CircularProgressIndicator(strokeWidth: 3, color: C.emergency))
                                : Icon(
                                    ready ? Icons.check_rounded : Icons.double_arrow_rounded,
                                    key: ValueKey(ready),
                                    color: ready ? C.ok : C.emergency,
                                    size: 28,
                                  ),
                          ),
                        ),
                      ),
                    ),
                  ]),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

class _BackButton extends StatelessWidget {
  const _BackButton({required this.onPressed});
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: OutlinedButton.icon(
        onPressed: onPressed,
        icon: const Icon(Icons.arrow_back_rounded, size: 20),
        label: const Text('Kembali', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
        style: OutlinedButton.styleFrom(
          foregroundColor: C.text,
          backgroundColor: Colors.white,
          disabledForegroundColor: C.muted.withValues(alpha: .6),
          side: BorderSide(color: enabled ? C.outline : C.outline.withValues(alpha: .5), width: 1.5),
          shape: const StadiumBorder(),
          elevation: 0,
        ).copyWith(
          overlayColor: WidgetStatePropertyAll(C.primary.withValues(alpha: .06)),
        ),
      ),
    );
  }
}

class _SuggestChip extends StatelessWidget {
  const _SuggestChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Material(
        color: selected ? C.primary : C.primaryTint,
        borderRadius: BorderRadius.circular(99),
        child: InkWell(
          borderRadius: BorderRadius.circular(99),
          onTap: onTap,
          child: AnimatedPadding(
            duration: const Duration(milliseconds: 150),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (selected) ...[const Icon(Icons.check, size: 14, color: Colors.white), const SizedBox(width: 4)],
              Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: selected ? Colors.white : C.primaryDark)),
            ]),
          ),
        ),
      );
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
