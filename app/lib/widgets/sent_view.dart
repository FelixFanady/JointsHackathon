import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme.dart';

class SentView extends StatelessWidget {
  const SentView({super.key, required this.title, required this.message, required this.onDone, this.code});
  final String title;
  final String message;
  final VoidCallback onDone;
  final String? code;

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.of(context).disableAnimations;
    return Column(children: [
      Expanded(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            TweenAnimationBuilder<double>(
              tween: Tween(begin: reduce ? 1 : 0, end: 1),
              duration: const Duration(milliseconds: 600),
              curve: Curves.elasticOut,
              builder: (_, v, c) => Transform.scale(scale: v, child: c),
              child: const CircleAvatar(radius: 48, backgroundColor: C.okBg, child: Icon(Icons.check_rounded, size: 56, color: C.ok)),
            ),
            const SizedBox(height: 20),
            Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(message, textAlign: TextAlign.center, style: const TextStyle(color: C.muted, fontSize: 16)),
            if (code != null) ...[
              const SizedBox(height: 20),
              ReportIdBox(code: code!),
            ],
          ]),
        ),
      ),
      SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: PrimaryButton(label: 'Selesai', onPressed: onDone),
        ),
      ),
    ]);
  }
}

class ReportIdBox extends StatefulWidget {
  const ReportIdBox({super.key, required this.code});
  final String code;
  @override
  State<ReportIdBox> createState() => _ReportIdBoxState();
}

class _ReportIdBoxState extends State<ReportIdBox> {
  bool copied = false;

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: widget.code));
    HapticFeedback.selectionClick();
    setState(() => copied = true);
    await Future.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => copied = false);
  }

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
        decoration: BoxDecoration(color: C.card, borderRadius: BorderRadius.circular(16), boxShadow: shadowSm, border: Border.all(color: C.field)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            const Text('ID Laporan', style: TextStyle(fontSize: 12, color: C.muted, fontWeight: FontWeight.w600)),
            Text(widget.code, style: const TextStyle(fontFamily: 'monospace', fontSize: 18, fontWeight: FontWeight.w800, letterSpacing: .5)),
          ]),
          const SizedBox(width: 12),
          TextButton.icon(
            onPressed: _copy,
            icon: Icon(copied ? Icons.check : Icons.copy_rounded, size: 16),
            label: Text(copied ? 'Tersalin' : 'Salin'),
            style: TextButton.styleFrom(
              foregroundColor: C.primary,
              backgroundColor: C.primaryTint,
              shape: const StadiumBorder(),
              textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
            ),
          ),
        ]),
      );
}
