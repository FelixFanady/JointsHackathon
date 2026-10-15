import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../theme.dart';
import 'home.dart';
import 'map_screen.dart';
import 'nearby.dart';
import 'reports.dart';

class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int index = 0;

  void goTo(int i) => setState(() => index = i);

  @override
  Widget build(BuildContext context) {
    final pages = [
      HomeScreen(onOpenNearby: () => goTo(2)),
      const ReportsScreen(),
      const NearbyScreen(),
      const MapScreen(),
    ];
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(color: C.primaryDark, borderRadius: BorderRadius.circular(12)),
            child: const Icon(Icons.shield, size: 20, color: Colors.white),
          ),
          const SizedBox(width: 12),
          Text(['Beranda', 'Laporan', 'Sekitar', 'Peta'][index]),
        ]),
        actions: [
          IconButton(onPressed: _profile, icon: const CircleAvatar(radius: 18, backgroundColor: C.primaryDark, child: Icon(Icons.person, size: 20, color: Colors.white))),
          const SizedBox(width: 8),
        ],
      ),
      body: Stack(children: [
        for (var i = 0; i < pages.length; i++)
          IgnorePointer(
            ignoring: i != index,
            child: AnimatedOpacity(
              opacity: i == index ? 1 : 0,
              duration: const Duration(milliseconds: 260),
              curve: Curves.easeOut,
              child: AnimatedSlide(
                offset: i == index ? Offset.zero : Offset(i < index ? -.04 : .04, 0),
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeOutCubic,
                child: TickerMode(enabled: i == index, child: pages[i]),
              ),
            ),
          ),
      ]),
      bottomNavigationBar: _AnimatedNavBar(
        index: index,
        onTap: (i) {
          if (i == index) return;
          HapticFeedback.selectionClick();
          goTo(i);
        },
        items: const [
          (Icons.home_outlined, Icons.home_rounded, 'Beranda'),
          (Icons.campaign_outlined, Icons.campaign, 'Lapor'),
          (Icons.radar_outlined, Icons.radar, 'Sekitar'),
          (Icons.map_outlined, Icons.map, 'Peta'),
        ],
      ),
    );
  }

  void _profile() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(session.name ?? '', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text('NIK ${maskNik(session.nik ?? '')}', style: const TextStyle(color: C.muted)),
            const SizedBox(height: 20),
            PrimaryButton(
              label: 'Bukan Anda? Ganti NIK',
              color: C.emergency,
              icon: Icons.logout,
              onPressed: () {
                Navigator.pop(ctx);
                session.signOut();
              },
            ),
          ]),
        ),
      ),
    );
  }
}

class _AnimatedNavBar extends StatelessWidget {
  const _AnimatedNavBar({required this.index, required this.onTap, required this.items});
  final int index;
  final ValueChanged<int> onTap;
  final List<(IconData, IconData, String)> items;

  @override
  Widget build(BuildContext context) {
    final n = items.length;
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [BoxShadow(color: const Color(0xFF14213D).withValues(alpha: .06), blurRadius: 16, offset: const Offset(0, -4))],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 72,
          child: LayoutBuilder(builder: (_, box) {
            final w = box.maxWidth / n;
            const pillW = 64.0, pillH = 34.0;
            return Stack(children: [
              AnimatedPositioned(
                duration: const Duration(milliseconds: 380),
                curve: Curves.easeOutBack,
                left: w * index + (w - pillW) / 2,
                top: 9,
                width: pillW,
                height: pillH,
                child: Container(decoration: BoxDecoration(color: C.primaryTint, borderRadius: BorderRadius.circular(99))),
              ),
              Row(children: [
                for (var i = 0; i < n; i++)
                  Expanded(child: _NavItem(item: items[i], selected: i == index, onTap: () => onTap(i))),
              ]),
            ]);
          }),
        ),
      ),
    );
  }
}

class _NavItem extends StatefulWidget {
  const _NavItem({required this.item, required this.selected, required this.onTap});
  final (IconData, IconData, String) item;
  final bool selected;
  final VoidCallback onTap;
  @override
  State<_NavItem> createState() => _NavItemState();
}

class _NavItemState extends State<_NavItem> {
  bool pressed = false;

  @override
  Widget build(BuildContext context) {
    final sel = widget.selected;
    final color = sel ? C.primary : C.muted;
    return Semantics(
      selected: sel,
      button: true,
      label: widget.item.$3,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => setState(() => pressed = true),
        onTapCancel: () => setState(() => pressed = false),
        onTapUp: (_) => setState(() => pressed = false),
        onTap: widget.onTap,
        child: AnimatedScale(
          scale: pressed ? .88 : 1,
          duration: const Duration(milliseconds: 120),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            SizedBox(
              height: 34,
              child: Center(
                child: TweenAnimationBuilder<double>(
                  key: ValueKey(sel),
                  tween: Tween(begin: sel ? .6 : 1, end: 1),
                  duration: const Duration(milliseconds: 450),
                  curve: Curves.elasticOut,
                  builder: (_, s, c) => Transform.scale(scale: s, child: c),
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: Icon(sel ? widget.item.$2 : widget.item.$1, key: ValueKey(sel), color: color, size: 24),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 4),
            AnimatedDefaultTextStyle(
              duration: const Duration(milliseconds: 200),
              style: TextStyle(fontSize: 12, fontWeight: sel ? FontWeight.w700 : FontWeight.w500, color: color, fontFamily: DefaultTextStyle.of(context).style.fontFamily),
              child: Text(widget.item.$3),
            ),
          ]),
        ),
      ),
    );
  }
}
