import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
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
  // Android channels are immutable once created: sound/vibration changes need a new id.
  static const _oldChannels = ['siaga_alarm_v1', 'siaga_kriminal_v2'];
  static const _disaster =
      _Kind('siaga_bencana_v2', 'Peringatan Bencana Alam', 'Sirene bencana selama 30 detik, satu kali per peringatan', 'siren_disaster');
  static const _crime = _Kind('siaga_kriminal_v3', 'Peringatan Kriminalitas', 'Sirene polisi satu kali per peringatan', 'siren_police');
  static const _general = _Kind('siaga_umum_v2', 'Info SiagaKu', 'Pemberitahuan umum dari petugas', null);
  // Vibration plays once (never repeats): disaster = alarm rhythm, crime = a single buzz.
  static final _vibDisaster = Int64List.fromList([0, 900, 350, 900, 350, 1500]);
  static final _vibCrime = Int64List.fromList([0, 700]); // one buzz
  static const _maxRemembered = 200;

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
      final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      for (final id in _oldChannels) {
        await android?.deleteNotificationChannel(id);
      }
      for (final k in [_disaster, _crime, _general]) {
        // One failing channel (e.g. siren file missing) must not stop the others.
        try {
          await android?.createNotificationChannel(AndroidNotificationChannel(
            k.channel,
            k.name,
            description: k.description,
            importance: Importance.max,
            playSound: true,
            sound: k.sound == null ? null : RawResourceAndroidNotificationSound(k.sound),
            audioAttributesUsage: k.sound == null ? AudioAttributesUsage.notification : AudioAttributesUsage.alarm,
            enableVibration: true,
            vibrationPattern: _vibration(k),
            showBadge: true,
          ));
        } catch (_) {}
      }
      _ready = true;
    } catch (_) {}
  }

  static Int64List? _vibration(_Kind k) => identical(k, _disaster)
      ? _vibDisaster
      : identical(k, _crime)
          ? _vibCrime
          : null;

  // Words that decide the siren. Checked on title + message, crime first
  // ("kebakaran akibat penjarahan" is still a crime alert).
  static const _crimeWords = [
    'kriminal',
    'curi(?!ga)',
    'pencurian',
    'maling',
    'begal',
    'rampok',
    'perampokan',
    'jambret',
    'copet',
    'penjarahan',
    'jarah',
    'tawuran',
    'bunuh',
    'pembunuhan',
    'tusuk',
    'penusukan',
    'culik',
    'penculikan',
    'kekerasan',
    'penganiayaan',
    'pelecehan',
    'narkoba',
    'senjata',
    'pencopetan',
    'penipuan',
  ];
  static const _disasterWords = [
    'bencana',
    'gempa',
    'tsunami',
    'banjir',
    'longsor',
    'kebakaran',
    'gunung api',
    'erupsi',
    'letusan',
    'meletus',
    'puting beliung',
    'angin kencang',
    'badai',
    'siklon',
    'gelombang tinggi',
    'abu vulkanik',
    'kekeringan',
    'evakuasi',
    'awan panas',
    'lahar',
  ];

  static _Kind _kindOf(AppNotice n) {
    // Support picks the kind on the web; trust it when present.
    switch (n.kind) {
      case 'bencana':
        return _disaster;
      case 'kriminal':
        return _crime;
      case 'umum':
        return _general;
    }
    // Older notices without a kind: guess from the words.
    final text = '${n.title} ${n.message}'.toLowerCase();
    // Word start, allowing Indonesian prefixes ("dicuri", "dibegal", "terbakar" style forms).
    bool has(List<String> words) => words.any((w) => RegExp('(^|[^a-z])(di|ke|ter|pen|pem|pe)?$w').hasMatch(text));
    if (has(_crimeWords)) return _crime;
    if (has(_disasterWords)) return _disaster;
    return _general;
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
      final shownKey = 'notice_shown_$nik';
      final since = prefs.getString(key);
      final shown = (prefs.getStringList(shownKey) ?? const <String>[]).toList();
      final loc = await _locationForServer();
      final items = await Api.notices(nik, since: since, lat: loc?.$1, lng: loc?.$2);
      items.sort((a, b) => a.createdAt.compareTo(b.createdAt));

      if (since == null || !prefs.containsKey(shownKey)) {
        // First poll after login: baseline only, never replay old notices.
        shown.addAll(items.map((n) => n.id).where((id) => !shown.contains(id)));
        await _save(
            prefs, key, shownKey, shown, items.isEmpty ? (since ?? '1970-01-01T00:00:00.000Z') : _later(since, items.last.createdAt));
        return;
      }

      // Each notice alerts exactly once (remembered by id), even if the server returns it again
      // or the user already opened / swiped it away. The cursor only moves FORWARD and only past
      // notices that were actually shown, so a failed show is retried on the next tick instead of lost.
      var cursor = since;
      for (final n in items) {
        if (!shown.contains(n.id)) {
          if (!await _showSafe(n)) break;
          shown.add(n.id);
        }
        cursor = _later(cursor, n.createdAt);
      }
      await _save(prefs, key, shownKey, shown, cursor);
    } catch (_) {
      // offline / server down: try again on the next tick
    } finally {
      _busy = false;
    }
  }

  static String _later(String? a, String b) => a == null || _after(b, a) ? b : a;

  static Future<void> _save(SharedPreferences prefs, String key, String shownKey, List<String> shown, String cursor) async {
    if (shown.length > _maxRemembered) shown.removeRange(0, shown.length - _maxRemembered);
    await prefs.setStringList(shownKey, shown);
    await prefs.setString(key, cursor);
  }

  /// Show with its siren; if that fails (e.g. a build without the siren file), still show it
  /// with the normal sound rather than dropping a safety alert.
  static Future<bool> _showSafe(AppNotice n) async {
    try {
      await _show(n, _kindOf(n));
      return true;
    } catch (_) {}
    try {
      await _show(n, _general);
      return true;
    } catch (_) {
      return false;
    }
  }

  static bool _after(String a, String b) {
    final x = DateTime.tryParse(a), y = DateTime.tryParse(b);
    return x != null && y != null ? x.isAfter(y) : a.compareTo(b) > 0;
  }

  static DateTime? _locSentAt;
  static const _locEvery = Duration(minutes: 5);

  /// Position to share with the server at most every 5 minutes. Never prompts: only when the
  /// citizen already allowed location (the SOS/report screens ask for it).
  static Future<(double, double)?> _locationForServer() async {
    final now = DateTime.now();
    if (_locSentAt != null && now.difference(_locSentAt!) < _locEvery) return null;
    try {
      final perm = await Geolocator.checkPermission();
      if (perm != LocationPermission.whileInUse && perm != LocationPermission.always) return null;
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      final p = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium, timeLimit: Duration(seconds: 8)));
      _locSentAt = now;
      return (p.latitude, p.longitude);
    } catch (_) {
      return null;
    }
  }

  /// Stable across app restarts (String.hashCode is not guaranteed to be).
  static int _idFor(String s) {
    var h = 0x811c9dc5;
    for (final c in s.codeUnits) {
      h = ((h ^ c) * 0x01000193) & 0x7fffffff;
    }
    return h;
  }

  static Future<void> _show(AppNotice n, _Kind k) async {
    final title = n.level == 'danger'
        ? '🚨 ${n.title}'
        : n.level == 'warning'
            ? '⚠️ ${n.title}'
            : n.title;
    // A photo (instant crime alert) is shown big when the notification is expanded; the text stays
    // readable underneath. No photo, or it cannot be downloaded quickly -> the normal text style.
    final photo = await _photoBytes(n.photoUrl);
    final StyleInformation style = photo != null
        ? BigPictureStyleInformation(
            ByteArrayAndroidBitmap(photo),
            largeIcon: ByteArrayAndroidBitmap(photo),
            contentTitle: title,
            summaryText: n.message.split('\n').first,
            hideExpandedLargeIcon: true,
          )
        : BigTextStyleInformation(n.message);
    await _plugin.show(
      _idFor(n.id),
      title,
      n.message,
      NotificationDetails(
        android: AndroidNotificationDetails(
          k.channel,
          k.name,
          channelDescription: k.description,
          importance: Importance.max,
          priority: Priority.max,
          category: identical(k, _general) ? AndroidNotificationCategory.message : AndroidNotificationCategory.alarm,
          visibility: NotificationVisibility.public,
          ticker: n.title,
          playSound: true,
          sound: k.sound == null ? null : RawResourceAndroidNotificationSound(k.sound),
          audioAttributesUsage: k.sound == null ? AudioAttributesUsage.notification : AudioAttributesUsage.alarm,
          enableVibration: true,
          vibrationPattern: _vibration(k),
          // Sound plays ONCE (no FLAG_INSISTENT): the disaster siren file itself is 30 s,
          // the police siren ~3.6 s. Opening or swiping the notification stops it.
          onlyAlertOnce: true,
          autoCancel: true,
          styleInformation: style,
        ),
        iOS: const DarwinNotificationDetails(presentAlert: true, presentBadge: true, presentSound: true),
      ),
    );
  }

  /// Download a notification photo: https/http only, at most 2.5 MB, 6 s. Any problem -> null (text only).
  static Future<Uint8List?> _photoBytes(String? url) async {
    if (url == null || url.isEmpty) return null;
    final u = Uri.tryParse(url);
    if (u == null || (u.scheme != 'https' && u.scheme != 'http')) return null;
    try {
      final r = await http.get(u).timeout(const Duration(seconds: 6));
      if (r.statusCode != 200 || r.bodyBytes.length < 100 || r.bodyBytes.length > 2500000) return null;
      return r.bodyBytes;
    } catch (_) {
      return null;
    }
  }
}

/// Which alert a notice gets: its Android channel and siren (res/raw name, null = default sound).
class _Kind {
  const _Kind(this.channel, this.name, this.description, this.sound);
  final String channel, name, description;
  final String? sound;
}
