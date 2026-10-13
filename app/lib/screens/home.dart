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
      onRefresh: _loadNearby,
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

/// Hold-to-activate SOS (3 s), per DESIGN.md.
/// Idle: soft ripples + breathing. Pressed: button sinks, glow grows, ring fills,
/// countdown number pops each second with a rising beep; release early = cancel.
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
    // Respect the system "remove animations" setting.
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

  // One beep + vibration per second while holding: 3 (low) -> 2 -> 1 (high).
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
            final breath = 1 + .025 * math.sin(t * 2 * math.pi);
            // Number pops at the start of each second.
            final frac = (v * holdDuration.inSeconds) % 1;
            final pop = 1 + .35 * (1 - Curves.easeOut.transform(math.min(frac * 4, 1)));
            // Tiny tremble that grows as the hold completes.
            final shake = pressed ? math.sin(t * 2 * math.pi * 40) * 1.6 * v : 0.0;
            final remaining = (holdDuration.inSeconds - v * holdDuration.inSeconds).ceil().clamp(1, holdDuration.inSeconds);

            return SizedBox(
              width: 300, height: 300,
              child: Stack(alignment: Alignment.center, children: [
                // Idle: three ripples spreading outward.
                if (!pressed)
                  for (var k = 0; k < 3; k++)
                    _ring(
                      size: 210 + 90 * ((t + k / 3) % 1),
                      color: C.emergency.withValues(alpha: .22 * (1 - (t + k / 3) % 1)),
                    ),
                // Pressed: a strong glow that grows with the hold.
                if (pressed)
                  _ring(
                    size: 240 + 50 * v + 6 * math.sin(t * 2 * math.pi * 6),
                    color: C.emergency.withValues(alpha: .14 + .22 * v),
                  ),
                // Progress ring.
                SizedBox(
                  width: 246, height: 246,
                  child: CircularProgressIndicator(
                    value: v,
                    strokeWidth: 10,
                    strokeCap: StrokeCap.round,
                    color: C.emergencyDark,
                    backgroundColor: pressed ? C.emergency.withValues(alpha: .15) : Colors.transparent,
                  ),
                ),
                // The button itself: sinks when pressed, springs back on release.
                Transform.translate(
                  offset: Offset(shake, 0),
                  child: AnimatedScale(
                    scale: down ? .92 : 1,
                    duration: Duration(milliseconds: down ? 140 : 520),
                    curve: down ? Curves.easeOut : Curves.elasticOut,
                    child: Transform.scale(
                      scale: pressed ? 1 : breath,
                      child: Container(
                        width: 214, height: 214,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(
                            center: const Alignment(-.35, -.45),
                            radius: 1.1,
                            colors: pressed
                                ? [Color.lerp(C.emergency, C.emergencyDark, v)!, C.emergencyDark]
                                : const [C.emergencyGlow, C.emergency, C.emergencyDark],
                          ),
                          border: Border.all(color: Colors.white.withValues(alpha: .35), width: 4),
                          boxShadow: [
                            BoxShadow(
                              color: C.emergency.withValues(alpha: pressed ? .35 + .3 * v : .4),
                              blurRadius: pressed ? 24 + 30 * v : 32,
                              spreadRadius: pressed ? 2 + 6 * v : 0,
                              offset: Offset(0, pressed ? 4 : 12),
                            ),
                          ],
                        ),
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          Icon(pressed ? Icons.emergency_share : Icons.warning_amber_rounded, size: 52, color: Colors.white),
                          const SizedBox(height: 2),
                          Transform.scale(
                            scale: pressed ? pop : 1,
                            child: Text(
                              pressed ? '$remaining' : 'SOS',
                              style: const TextStyle(fontSize: 46, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: 1.5,
                                  shadows: [Shadow(color: Color(0x55000000), blurRadius: 8, offset: Offset(0, 2))]),
                            ),
                          ),
                        ]),
                      ),
                    ),
                  ),
                ),
              ]),
            );
          },
        ),
      ),
    );
  }

  Widget _ring({required double size, required Color color}) => IgnorePointer(
        child: Container(width: size, height: size, decoration: BoxDecoration(shape: BoxShape.circle, color: color)),
      );
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
      await Api.sendSos(
        nik: session.nik!, lat: place!.lat, lng: place!.lng, category: category ?? 'Darurat', photoB64: photoB64,
        description: isOther && otherText.isNotEmpty ? otherText : null,
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
              // "Bencana Lainnya": let the citizen type what is happening.
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
          secondary: SecondaryButton(label: 'Kembali', onPressed: () => setState(() => step = 0)),
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
                _row(iconForCategory(category ?? ''), 'Jenis kejadian', categoryLabel),
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
