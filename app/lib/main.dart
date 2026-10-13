import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api.dart';
import 'screens/login.dart';
import 'screens/shell.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(statusBarColor: Colors.transparent, statusBarIconBrightness: Brightness.dark));
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  await session.load();
  runApp(const SiagaKuApp());
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
