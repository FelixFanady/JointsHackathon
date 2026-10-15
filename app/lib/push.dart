import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api.dart';
import 'notifier.dart';

@pragma('vm:entry-point')
Future<void> siagakuBackgroundPush(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {}
  await Notifier.showFromPush(message.data);
}

class Push {
  Push._();

  static const _topic = 'siagaku_all';

  static bool _ready = false;
  static String? _nik;
  static String? _token;
  static StreamSubscription<String>? _refreshSub;
  static StreamSubscription<RemoteMessage>? _foregroundSub;

  static bool get _supported => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static Future<void> init() async {
    if (!_supported || _ready) return;
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(siagakuBackgroundPush);
      _foregroundSub = FirebaseMessaging.onMessage.listen((m) => Notifier.showFromPush(m.data));
      _refreshSub = FirebaseMessaging.instance.onTokenRefresh.listen((t) {
        _token = t;
        unawaited(_register());
      });
      _ready = true;
    } catch (_) {
    }
  }

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
        final oldNik = _nik!, token = _token;
        _nik = null;
        _token = null;
        await FirebaseMessaging.instance.unsubscribeFromTopic(_topic);
        if (token != null) await Api.registerPushToken(oldNik, token, unregister: true);
      }
    } catch (_) {
      _nik = null;
    }
  }

  static Future<void> _register() async {
    final nik = _nik, token = _token;
    if (nik == null || token == null) return;
    try {
      await Api.registerPushToken(nik, token);
    } catch (_) {
      _nik = null;
    }
  }

  @visibleForTesting
  static Future<void> dispose() async {
    await _refreshSub?.cancel();
    await _foregroundSub?.cancel();
  }
}
