import 'package:flutter/material.dart';

import '../theme.dart';

/// "Sent" confirmation used after BOTH an SOS and a citizen report, so they look the same:
/// a large green check that pops in, a title, a short reassurance, and a full-width "Selesai".
class SentView extends StatelessWidget {
  const SentView({super.key, required this.title, required this.message, required this.onDone});
  final String title;
  final String message;
  final VoidCallback onDone;

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
