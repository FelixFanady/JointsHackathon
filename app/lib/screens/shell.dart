import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import 'home.dart';
import 'map_screen.dart';
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
      HomeScreen(onOpenMap: () => goTo(2)),
      const ReportsScreen(),
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
          Text(['Beranda', 'Laporan', 'Peta'][index]),
        ]),
        actions: [
          IconButton(onPressed: _profile, icon: const CircleAvatar(radius: 18, backgroundColor: C.primaryDark, child: Icon(Icons.person, size: 20, color: Colors.white))),
          const SizedBox(width: 8),
        ],
      ),
      body: IndexedStack(index: index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: goTo,
        backgroundColor: Colors.white.withValues(alpha: .95),
        indicatorColor: Colors.transparent,
        height: 68,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home, color: C.primary), label: 'Beranda'),
          NavigationDestination(icon: Icon(Icons.campaign_outlined), selectedIcon: Icon(Icons.campaign, color: C.primary), label: 'Lapor'),
          NavigationDestination(icon: Icon(Icons.map_outlined), selectedIcon: Icon(Icons.map, color: C.primary), label: 'Peta'),
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
