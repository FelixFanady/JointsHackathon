import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api.dart';
import 'notifier.dart';
import 'screens/login.dart';
import 'screens/shell.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(statusBarColor: Colors.transparent, statusBarIconBrightness: Brightness.dark));
  // Fire-and-forget: orientation lock must not block first frame.
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  // Load the saved session before building UI (fast, local read).
  await session.load();
  // Show UI immediately so the device never sits on a black screen.
  runApp(const SiagaKuApp());
  // Support notifications: set up AFTER the first frame so plugin init / permission
  // prompts / polling can never block startup rendering.
  WidgetsBinding.instance.addPostFrameCallback((_) async {
    await Notifier.init();
    session.addListener(Notifier.sync);
    Notifier.sync();
  });
}

class SiagaKuApp extends StatelessWidget {
  const SiagaKuApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SiagaKu',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: ListenableBuilder(
        listenable: session,
        builder: (_, __) => session.signedIn ? const Shell() : const LoginScreen(),
      ),
    );
  }
}
