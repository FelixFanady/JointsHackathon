import 'dart:convert';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'auto_refresh.dart';
import 'theme.dart' show reportCode;

/// Backend base URL. Override with: flutter run --dart-define=API_BASE=https://your-domain
/// Defaults target a Next.js dev server on the host machine (Android emulator uses 10.0.2.2).
String get apiBase {
  const fromEnv = String.fromEnvironment('API_BASE');
  if (fromEnv.isNotEmpty) return fromEnv;
  return !kIsWeb && Platform.isAndroid ? 'http://10.0.2.2:3000' : 'http://127.0.0.1:3000';
}

class ApiException implements Exception {
  ApiException(this.message, {this.inactive = false});
  final String message;

  /// The server says this citizen's account was deactivated by an admin (HTTP 403, code "inactive").
  final bool inactive;
  @override
  String toString() => message;
}

class NearbyItem {
  NearbyItem.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        kind = j['kind'] as String,
        category = j['category'] as String,
        address = j['address'] as String?,
        status = j['status'] as String,
        lat = (j['lat'] as num).toDouble(),
        lng = (j['lng'] as num).toDouble(),
        createdAt = j['created_at'] as String,
        verifiedBy = j['verified_by'] as String?,
        distanceKm = (j['distance_km'] as num).toDouble();
  final String id, kind, category, status, createdAt;
  /// 'petugas' | 'otomatis' (AI + BMKG) when status is valid.
  final String? address, verifiedBy;
  final double lat, lng, distanceKm;
}

class MyReport {
  MyReport.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        kind = j['kind'] as String,
        category = j['category'] as String,
        description = j['description'] as String?,
        address = j['address'] as String?,
        status = j['status'] as String,
        verifiedBy = j['verified_by'] as String?,
        createdAt = j['created_at'] as String;
  final String id, kind, category, status, createdAt;
  /// 'petugas' | 'otomatis' (AI + BMKG) when status is valid.
  final String? description, address, verifiedBy;
}

/// "Status Wilayah" set by Support/Admin, e.g. SIAGA BENCANA GEMPA for Aceh. level: waspada | siaga | awas.
class AreaStatus {
  AreaStatus.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        title = j['title'] as String,
        level = (j['level'] as String?) ?? 'waspada',
        hazard = (j['hazard'] as String?) ?? 'lainnya',
        scopeLabel = (j['scope_label'] as String?) ?? '',
        message = (j['message'] as String?) ?? '',
        createdAt = j['created_at'] as String,
        endsAt = j['ends_at'] as String?;
  final String id, title, level, hazard, scopeLabel, message, createdAt;
  final String? endsAt;
}

/// A notification sent by Support. level: info | warning | danger.
class AppNotice {
  AppNotice.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        title = j['title'] as String,
        message = j['message'] as String,
        level = (j['level'] as String?) ?? 'info',
        kind = j['kind'] as String?,
        photoUrl = j['photo_url'] as String?,
        createdAt = j['created_at'] as String;
  final String id, title, message, level, createdAt;
  /// bencana | kriminal | umum, chosen by Support. Null on notices sent before the web had it.
  final String? kind;
  /// Reporter's photo attached to an instant crime alert (shown as a big picture).
  final String? photoUrl;
}

class Api {
  /// Notifications Support sent to this citizen (plus broadcasts). Pass [since] (ISO) to get only newer ones.
  /// Each call also tells the server this app is receiving notifications.
  static Future<List<AppNotice>> notices(String nik, {String? since, double? lat, double? lng}) async {
    final j = await _post('/api/mobile/notices', {
      'nik': nik,
      if (since != null) 'since': since,
      // Last known position, so Support can alert citizens near a verified incident.
      if (lat != null && lng != null) ...{'lat': lat, 'lng': lng},
    });
    return (j['notices'] as List).map((e) => AppNotice.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    try {
      final r = await http
          .post(Uri.parse('$apiBase$path'), headers: {'Content-Type': 'application/json'}, body: jsonEncode(body))
          .timeout(const Duration(seconds: 25));
      return _decode(r);
    } on ApiException catch (e) {
      // Deactivated while signed in: leave the app right away, and tell the login screen why.
      if (e.inactive && session.signedIn) session.forceSignOut(e.message);
      rethrow;
    } catch (_) {
      throw ApiException('Tidak dapat terhubung ke server. Periksa koneksi internet Anda.');
    }
  }

  static Map<String, dynamic> _decode(http.Response r) {
    Map<String, dynamic> j = {};
    try {
      j = jsonDecode(r.body) as Map<String, dynamic>;
    } catch (_) {}
    if (r.statusCode >= 200 && r.statusCode < 300) return j;
    throw ApiException((j['error'] as String?) ?? 'Terjadi kesalahan (${r.statusCode}).', inactive: r.statusCode == 403 && j['code'] == 'inactive');
  }

  /// Returns the citizen's name for a NIK.
  static Future<String> identify(String nik) async => (await _post('/api/mobile/identify', {'nik': nik}))['name'] as String;

  // After a successful send every list/map refreshes at once (see auto_refresh.dart).
  // Both return the new report's ID ("SOS-…" / "LW-…") for the confirmation screen.
  static Future<String?> sendSos({required String nik, required double lat, required double lng, required String category, String? description, String? photoB64, String? address}) async {
    final j = await _post('/api/mobile/sos', {'nik': nik, 'lat': lat, 'lng': lng, 'category': category, 'description': description, 'photo': photoB64, 'address': address});
    notifyReportsChanged();
    return _codeOf(j, 'sos');
  }

  static String? _codeOf(Map<String, dynamic> j, String kind) {
    final c = j['code'];
    if (c is String && c.isNotEmpty) return c;
    final id = j['id'];
    return id is String && id.isNotEmpty ? reportCode(id, kind) : null;
  }

  static Future<String?> sendReport({
    required String nik,
    required double lat,
    required double lng,
    required String category,
    required String description,
    required bool danger,
    String? photoB64,
    String? address,
  }) async {
    final j = await _post('/api/mobile/report', {
      'nik': nik, 'lat': lat, 'lng': lng, 'category': category,
      'description': description, 'danger': danger, 'photo': photoB64, 'address': address,
    });
    notifyReportsChanged();
    return _codeOf(j, 'report');
  }

  /// Status Wilayah active for the whole country plus the province at (lat, lng). Without a location: country-wide only.
  static Future<List<AreaStatus>> areaStatus(String nik, {double? lat, double? lng}) async {
    final j = await _post('/api/mobile/status', {'nik': nik, if (lat != null && lng != null) 'lat': lat, if (lat != null && lng != null) 'lng': lng});
    return ((j['statuses'] as List?) ?? []).map((e) => AreaStatus.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<List<MyReport>> myReports(String nik) async {
    final j = await _post('/api/mobile/my-reports', {'nik': nik});
    return (j['reports'] as List).map((e) => MyReport.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<List<NearbyItem>> nearby(double lat, double lng, {double radiusKm = 5}) async {
    // Read-only, so it is safe to retry: the dev server can be slow on its first request.
    for (var attempt = 1;; attempt++) {
      try {
        final r = await http
            .get(Uri.parse('$apiBase/api/mobile/nearby?lat=$lat&lng=$lng&radius_km=$radiusKm'))
            .timeout(const Duration(seconds: 20));
        final j = _decode(r);
        return (j['items'] as List).map((e) => NearbyItem.fromJson(e as Map<String, dynamic>)).toList();
      } on ApiException {
        rethrow;
      } catch (_) {
        if (attempt >= 3) throw ApiException('Tidak dapat terhubung ke server.');
        await Future.delayed(Duration(seconds: 2 * attempt));
      }
    }
  }
}

/// Logged-in citizen, persisted on the device.
class Session extends ChangeNotifier {
  String? nik;
  String? name;
  bool loaded = false;

  /// Why the app signed the user out on its own (e.g. account deactivated); shown once on the login screen.
  String? kickedReason;

  bool get signedIn => nik != null && name != null;

  Future<void> forceSignOut(String reason) async {
    kickedReason = reason;
    await signOut();
  }

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    nik = p.getString('nik');
    name = p.getString('name');
    loaded = true;
    notifyListeners();
  }

  Future<void> signIn(String nik, String name) async {
    final p = await SharedPreferences.getInstance();
    await p.setString('nik', nik);
    await p.setString('name', name);
    this.nik = nik;
    this.name = name;
    notifyListeners();
  }

  Future<void> signOut() async {
    final p = await SharedPreferences.getInstance();
    await p.remove('nik');
    await p.remove('name');
    nik = null;
    name = null;
    notifyListeners();
  }
}

final session = Session();

String maskNik(String nik) => nik.length == 16 ? '${nik.substring(0, 4)} •••• •••• ${nik.substring(12)}' : nik;

class Place {
  const Place(this.lat, this.lng);
  final double lat, lng;
}

/// Current GPS position, or null (with a user-readable reason) when unavailable.
Future<(Place?, String?)> currentPlace() async {
  try {
    if (!await Geolocator.isLocationServiceEnabled()) return (null, 'GPS tidak aktif. Aktifkan layanan lokasi.');
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
      return (null, 'Izin lokasi ditolak. Izinkan lokasi di pengaturan aplikasi.');
    }
    final p = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 15)));
    return (Place(p.latitude, p.longitude), null);
  } catch (_) {
    return (null, 'Tidak dapat menentukan lokasi Anda. Coba lagi.');
  }
}

final _addressCache = <String, String>{};

/// Street address for a GPS point ("Jl. Merdeka 5, Kebon Melati, Tanah Abang, Jakarta Pusat") from
/// OpenStreetMap, or null when offline / not found. The coordinates themselves are still what gets sent
/// as the location; this is only for showing a readable place. One request per spot (cached).
Future<String?> addressFor(Place p) async {
  final key = '${p.lat.toStringAsFixed(4)},${p.lng.toStringAsFixed(4)}';
  final hit = _addressCache[key];
  if (hit != null) return hit;
  try {
    final r = await http.get(
      Uri.parse('https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=id&lat=${p.lat}&lon=${p.lng}'),
      headers: {'User-Agent': 'SiagaKu/1.0 (emergency-reporting hackathon project)', 'Accept': 'application/json'},
    ).timeout(const Duration(seconds: 8));
    if (r.statusCode != 200) return null;
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    final a = (j['address'] as Map?)?.cast<String, dynamic>() ?? const {};
    String? s(String k) => (a[k] as String?)?.trim();
    final road = [s('road'), s('house_number')].whereType<String>().where((v) => v.isNotEmpty).join(' ');
    final parts = <String?>[
      road.isEmpty ? (s('amenity') ?? s('building') ?? s('neighbourhood')) : road,
      s('village') ?? s('suburb') ?? s('quarter'),
      s('city_district') ?? s('district') ?? s('municipality'),
      s('city') ?? s('county') ?? s('town') ?? s('regency'),
    ];
    final seen = <String>{};
    final text = parts.whereType<String>().where((v) => v.isNotEmpty && seen.add(v)).join(', ');
    final out = text.isNotEmpty ? text : (j['display_name'] as String?)?.replaceAll(RegExp(r',\s*Indonesia$'), '');
    if (out == null || out.isEmpty) return null;
    _addressCache[key] = out;
    return out;
  } catch (_) {
    return null;
  }
}
