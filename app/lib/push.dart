import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api.dart';
import 'notifier.dart';

/// Runs in its OWN isolate when a push arrives while the app is in the background or closed.
/// Must be a top-level function (hence the entry-point pragma, or release builds strip it).
@pragma('vm:entry-point')
Future<void> siagakuBackgroundPush(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {}
  await Notifier.showFromPush(message.data);
}

/// Server push through Firebase Cloud Messaging, so notices arrive while the app is closed.
///
/// Needs android/app/google-services.json. Without it [init] quietly does nothing and the app keeps
/// working with Notifier's polling. Messages are data-only: Notifier builds the notification itself
/// (siren, vibration, photo), exactly like a polled one.
class Push {
  Push._();

  /// Every signed-in app subscribes to this topic; the server sends broadcasts ("semua warga") to it.
  static const _topic = 'siagaku_all';

  static bool _ready = false;
  static String? _nik; // the NIK this phone's token is registered under
  static String? _token;
  static StreamSubscription<String>? _refreshSub;
  static StreamSubscription<RemoteMessage>? _foregroundSub;

  static bool get _supported => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static Future<void> init() async {
    if (!_supported || _ready) return;
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(siagakuBackgroundPush);
      // App open: FCM does not show anything itself for data messages, so hand them to Notifier.
      _foregroundSub = FirebaseMessaging.onMessage.listen((m) => Notifier.showFromPush(m.data));
      _refreshSub = FirebaseMessaging.instance.onTokenRefresh.listen((t) {
        _token = t;
        unawaited(_register());
      });
      _ready = true;
    } catch (_) {
      // No google-services.json / no Google Play services: stay on polling.
    }
  }

  /// Follow the signed-in state. Call from the session listener (same place as Notifier.sync).
  static Future<void> sync() async {
    if (!_supported) return;
    await init();
    if (!_ready) return;
    try {
      final nik = session.nik;
      if (nik != null && session.signedIn) {
        if (_nik == nik && _token != null) return;
        _nik = nik;
        _token = await FirebaseMessaging.instance.getToken();
        await FirebaseMessaging.instance.subscribeToTopic(_topic);
        await _register();
      } else if (_nik != null) {
        // Signed out: stop this phone receiving the account's notices.
        final oldNik = _nik!, token = _token;
        _nik = null;
        _token = null;
        await FirebaseMessaging.instance.unsubscribeFromTopic(_topic);
        if (token != null) await Api.registerPushToken(oldNik, token, unregister: true);
      }
    } catch (_) {
      // Offline etc. The token is registered again on the next sign-in / app start.
      _nik = null;
    }
  }

  static Future<void> _register() async {
    final nik = _nik, token = _token;
    if (nik == null || token == null) return;
    try {
      await Api.registerPushToken(nik, token);
    } catch (_) {
      _nik = null; // retry on the next sync()
    }
  }

  @visibleForTesting
  static Future<void> dispose() async {
    await _refreshSub?.cancel();
    await _foregroundSub?.cancel();
  }
}
