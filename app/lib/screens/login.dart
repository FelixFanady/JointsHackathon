import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../theme.dart';

/// Step 1: NIK entry with the on-screen numpad from the design.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  String nik = '';
  bool loading = false;
  String? error;

  @override
  void initState() {
    super.initState();
    // Signed out by the app itself (account deactivated)? Say why, once.
    error = session.kickedReason;
    session.kickedReason = null;
  }
  void press(String d) {
    if (nik.length >= 16) return;
    HapticFeedback.selectionClick();
    setState(() { nik += d; error = null; });
  }

  void back() {
    if (nik.isEmpty) return;
    setState(() { nik = nik.substring(0, nik.length - 1); error = null; });
  }

  Future<void> next() async {
    setState(() { loading = true; error = null; });
    try {
      final name = await Api.identify(nik);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ConfirmIdentityScreen(nik: nik, name: name)));
    } on ApiException catch (e) {
      error = e.message;
    }
    if (mounted) setState(() => loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final ready = nik.length == 16;
    return Scaffold(
      body: SafeArea(
        child: Column(children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
              child: Column(children: [
                Container(
                  width: 80, height: 80,
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24), boxShadow: shadowMd),
                  child: const Icon(Icons.shield, size: 44, color: C.primary),
                ),
                const SizedBox(height: 20),
                const Text('Selamat Datang', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w700, letterSpacing: -.6, color: C.primaryDark)),
                const SizedBox(height: 6),
                const Text('Masuk dengan NIK Anda', style: TextStyle(fontSize: 16, color: C.muted)),
                const SizedBox(height: 24),
                AppCard(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      const Text('NIK', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                      const SizedBox(width: 6),
                      const Icon(Icons.info_outline, size: 16, color: C.muted),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(color: C.primaryTint, borderRadius: BorderRadius.circular(99)),
                        child: const Text('16 Digit', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: C.muted)),
                      ),
                    ]),
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(color: C.field, borderRadius: BorderRadius.circular(12)),
                      child: Text(
                        nik.isEmpty ? 'Masukkan 16 digit NIK' : nik,
                        style: TextStyle(fontSize: 20, letterSpacing: nik.isEmpty ? 0 : 1.5, color: nik.isEmpty ? C.muted.withValues(alpha: .6) : C.text, fontFeatures: const [FontFeature.tabularFigures()]),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(children: [
                      const Icon(Icons.badge_outlined, size: 14, color: C.muted),
                      const SizedBox(width: 6),
                      const Text('KTP Republik Indonesia', style: TextStyle(fontSize: 12, color: C.muted)),
                      const Spacer(),
                      Text('${nik.length}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                      const Text('/16', style: TextStyle(fontSize: 13, color: C.muted)),
                    ]),
                    if (error != null) ...[
                      const SizedBox(height: 10),
                      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Icon(Icons.error_outline, size: 16, color: C.emergency),
                        const SizedBox(width: 6),
                        Expanded(child: Text(error!, style: const TextStyle(fontSize: 13, color: C.emergency))),
                      ]),
                    ],
                  ]),
                ),
                const SizedBox(height: 16),
                PrimaryButton(label: 'Lanjutkan', icon: Icons.arrow_forward, loading: loading, onPressed: ready ? next : null),
                const SizedBox(height: 12),
                const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(Icons.lock_outline, size: 14, color: C.muted),
                  SizedBox(width: 6),
                  Flexible(child: Text('Data Anda aman • hanya untuk keperluan darurat', style: TextStyle(fontSize: 12, color: C.muted))),
                ]),
              ]),
            ),
          ),
          _Numpad(onDigit: press, onBack: back),
        ]),
      ),
    );
  }
}

class _Numpad extends StatelessWidget {
  const _Numpad({required this.onDigit, required this.onBack});
  final void Function(String) onDigit;
  final VoidCallback onBack;

  static const _sub = {'2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL', '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ'};

  // Not named `key`: that would clash with the inherited `Widget.key` field.
  Widget _digit(String d) => Expanded(
        child: Padding(
          padding: const EdgeInsets.all(5),
          child: Material(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            elevation: 0.5,
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => onDigit(d),
              child: SizedBox(
                height: 54,
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Text(d, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w500)),
                  if (_sub[d] != null) Text(_sub[d]!, style: const TextStyle(fontSize: 9, color: C.muted, letterSpacing: 1)),
                ]),
              ),
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(11, 6, 11, 14),
      margin: const EdgeInsets.fromLTRB(8, 0, 8, 6),
      decoration: BoxDecoration(color: C.primaryTint.withValues(alpha: .6), borderRadius: BorderRadius.circular(20)),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Row(children: [_digit('1'), _digit('2'), _digit('3')]),
        Row(children: [_digit('4'), _digit('5'), _digit('6')]),
        Row(children: [_digit('7'), _digit('8'), _digit('9')]),
        Row(children: [
          const Expanded(child: SizedBox()),
          _digit('0'),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(5),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: onBack,
                  child: const SizedBox(height: 54, child: Icon(Icons.backspace_outlined, color: C.text)),
                ),
              ),
            ),
          ),
        ]),
      ]),
    );
  }
}

/// Step 2: "Masuk sebagai <name>" with "Bukan Anda?" to change NIK.
class ConfirmIdentityScreen extends StatelessWidget {
  const ConfirmIdentityScreen({super.key, required this.nik, required this.name});
  final String nik, name;

  String get initials => name.trim().split(RegExp(r'\s+')).take(2).map((w) => w[0]).join().toUpperCase();
  String get first => name.trim().split(RegExp(r'\s+')).first;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(99), boxShadow: shadowSm),
              child: const Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.shield, size: 14, color: C.primary),
                SizedBox(width: 6),
                Text('SIAGAKU KEPENDUDUKAN', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: .6, color: C.muted)),
              ]),
            ),
            const SizedBox(height: 20),
            AppCard(
              padding: const EdgeInsets.all(24),
              child: Column(children: [
                CircleAvatar(
                  radius: 44,
                  backgroundColor: C.primaryFixed,
                  child: Text(initials, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: C.primaryDark)),
                ),
                const SizedBox(height: 16),
                const Text('Masuk sebagai', style: TextStyle(color: C.muted)),
                const SizedBox(height: 4),
                Text(name, textAlign: TextAlign.center, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700, letterSpacing: -.4)),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(color: C.field, borderRadius: BorderRadius.circular(99)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.badge_outlined, size: 16, color: C.muted),
                    const SizedBox(width: 8),
                    Text(maskNik(nik), style: const TextStyle(fontWeight: FontWeight.w600, fontFeatures: [FontFeature.tabularFigures()])),
                  ]),
                ),
              ]),
            ),
            const SizedBox(height: 12),
            const Text('Data kependudukan dicocokkan otomatis untuk penanganan darurat yang cepat dan presisi.',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: C.muted)),
            const Spacer(),
            PrimaryButton(
              label: 'Lanjutkan sebagai $first',
              icon: Icons.arrow_forward,
              onPressed: () async {
                await session.signIn(nik, name);
                if (context.mounted) Navigator.of(context).popUntil((r) => r.isFirst);
              },
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Bukan Anda? Masukkan NIK Lain', style: TextStyle(fontWeight: FontWeight.w600, color: C.primary)),
            ),
            const SizedBox(height: 8),
            const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(Icons.lock_outline, size: 14, color: C.muted),
              SizedBox(width: 6),
              Flexible(child: Text('Identitas hanya digunakan untuk keperluan darurat', style: TextStyle(fontSize: 12, color: C.muted))),
            ]),
          ]),
        ),
      ),
    );
  }
}
