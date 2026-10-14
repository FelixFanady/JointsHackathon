import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';

/// Pulls the notifications Support sends from the web console and shows them as
/// system notifications that sound + vibrate like an alarm.
///
/// Delivery model: the app polls /api/mobile/notices every [_every] while the app process is
/// alive (foreground, or backgrounded until Android suspends it). Waking a fully-closed app needs
/// server push (FCM) which this project does not have yet.
/// Every failure is swallowed: a notification problem must never break reporting or SOS.
class Notifier {
  Notifier._();

  static final _plugin = FlutterLocalNotificationsPlugin();
  static const _every = Duration(seconds: 15);
  // Android channels are immutable once created; bump the suffix to change sound/vibration.
  static const _channelId = 'siaga_alarm_v1';
  static const _alarmSound = 'content://settings/system/alarm_alert';
  // wait, buzz, pause, buzz, pause, long buzz (ms) -- an alarm-like rhythm.
  static final _pattern = Int64List.fromList([0, 900, 350, 900, 350, 1500]);

  static Timer? _timer;
  static bool _ready = false;
  static bool _busy = false;
  static String? _activeNik;

  static bool get _supported => !kIsWeb && (defaultTargetPlatform == TargetPlatform.android || defaultTargetPlatform == TargetPlatform.iOS);

  static Future<void> init() async {
    if (!_supported || _ready) return;
    try {
      await _plugin.initialize(const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false, requestSoundPermission: false),
      ));
      await _plugin
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(AndroidNotificationChannel(
            _channelId,
            'Peringatan SiagaKu',
            description: 'Notifikasi dari petugas Support (bunyi dan getar seperti alarm)',
            importance: Importance.max,
            playSound: true,
            sound: const UriAndroidNotificationSound(_alarmSound),
            audioAttributesUsage: AudioAttributesUsage.alarm,
            enableVibration: true,
            vibrationPattern: _pattern,
            showBadge: true,
          ));
      _ready = true;
    } catch (_) {}
  }

  static Future<void> _askPermission() async {
    try {
      await _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.requestNotificationsPermission();
      await _plugin
          .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
          ?.requestPermissions(alert: true, badge: true, sound: true);
    } catch (_) {}
  }

  /// Start/stop polling to follow the signed-in state. Call from the session listener.
  static void sync() {
    if (!_supported) return;
    if (session.signedIn) {
      if (_activeNik == session.nik) return;
      _activeNik = session.nik;
      _start();
    } else {
      _activeNik = null;
      _timer?.cancel();
      _timer = null;
    }
  }

  static Future<void> _start() async {
    await init();
    if (!_ready) return;
    await _askPermission();
    _timer?.cancel();
    unawaited(poll());
    _timer = Timer.periodic(_every, (_) => poll());
  }

  static Future<void> poll() async {
    final nik = session.nik;
    if (nik == null || !_ready || _busy) return;
    _busy = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final key = 'notice_since_$nik';
      final since = prefs.getString(key);
      final items = await Api.notices(nik, since: since);
      items.sort((a, b) => a.createdAt.compareTo(b.createdAt));
      // Remember the newest one we have seen. With nothing yet, start from epoch so the
      // very next notice counts as new.
      await prefs.setString(key, items.isEmpty ? '1970-01-01T00:00:00.000Z' : items.last.createdAt);
      if (since == null) return; // first poll after login: baseline only, never replay old notices
      for (final n in items) {
        await _show(n);
      }
    } catch (_) {
      // offline / server down: try again on the next tick
    } finally {
      _busy = false;
    }
  }

  static Future<void> _show(AppNotice n) async {
    final loud = n.level != 'info';
    final title = n.level == 'danger' ? '🚨 ${n.title}' : n.level == 'warning' ? '⚠️ ${n.title}' : n.title;
    await _plugin.show(
      n.id.hashCode & 0x7fffffff,
      title,
      n.message,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          'Peringatan SiagaKu',
          channelDescription: 'Notifikasi dari petugas Support (bunyi dan getar seperti alarm)',
          importance: Importance.max,
          priority: Priority.max,
          category: AndroidNotificationCategory.alarm,
          visibility: NotificationVisibility.public,
          ticker: n.title,
          playSound: true,
          sound: const UriAndroidNotificationSound(_alarmSound),
          audioAttributesUsage: AudioAttributesUsage.alarm,
          enableVibration: true,
          vibrationPattern: _pattern,
          styleInformation: BigTextStyleInformation(n.message),
          // FLAG_INSISTENT (4): keep sounding + vibrating until the user reacts, for warning/danger.
          // timeoutAfter stops it after one minute so it cannot ring forever.
          additionalFlags: loud ? Int32List.fromList(<int>[4]) : null,
          timeoutAfter: loud ? 60000 : null,
        ),
        iOS: const DarwinNotificationDetails(presentAlert: true, presentBadge: true, presentSound: true),
      ),
    );
  }
}
