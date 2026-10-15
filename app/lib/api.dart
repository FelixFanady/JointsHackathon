import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'auto_refresh.dart';
import 'theme.dart' show reportCode;

String get apiBase {
  const fromEnv = String.fromEnvironment('API_BASE');
  if (fromEnv.isNotEmpty) return fromEnv;
  return 'https://siagaku.felixfanady.com';
}

class ApiException implements Exception {
  ApiException(this.message, {this.inactive = false, this.code, this.status});
  final String message;

  final bool inactive;

  final String? code;
  final int? status;
  @override
  String toString() => message;
}

class Identity {
  const Identity(this.name, this.faceRegistered);
  final String name;
  final bool faceRegistered;
}

class FaceResult {
  FaceResult.fromJson(Map<String, dynamic> j)
      : match = j['match'] == true,
        confidence = ((j['confidence'] as num?) ?? 0).toDouble(),
        token = j['token'] as String?;
  final bool match;
  final double confidence;

  final String? token;
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
  final String? description, address, verifiedBy;
}

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
  final String? kind;
  final String? photoUrl;
}

class Api {
  static Future<List<AppNotice>> notices(String nik, {String? since, double? lat, double? lng}) async {
    final j = await _post('/api/mobile/notices', {
      'nik': nik,
      if (since != null) 'since': since,
      if (lat != null && lng != null) ...{'lat': lat, 'lng': lng},
    });
    return (j['notices'] as List).map((e) => AppNotice.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<void> registerPushToken(String nik, String token, {bool unregister = false}) async {
    await _post('/api/mobile/push-token', {'nik': nik, 'token': token, if (unregister) 'action': 'unregister'});
  }

  static Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body, {Duration timeout = const Duration(seconds: 25)}) async {
    try {
      final r = await http
          .post(Uri.parse('$apiBase$path'),
              headers: {
                'Content-Type': 'application/json',
                if (session.faceToken != null) 'x-face-token': session.faceToken!,
              },
              body: jsonEncode(body))
          .timeout(timeout);
      return _decode(r);
    } on ApiException catch (e) {
      if (e.inactive && session.signedIn) session.forceSignOut(e.message);
      if (e.code == 'face_required' && session.signedIn) session.forceSignOut(e.message);
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
    final code = j['code'] as String?;
    throw ApiException((j['error'] as String?) ?? 'Terjadi kesalahan (${r.statusCode}).',
        inactive: r.statusCode == 403 && code == 'inactive', code: code, status: r.statusCode);
  }

  static Future<Identity> identify(String nik) async {
    final j = await _post('/api/mobile/identify', {'nik': nik});
    return Identity(j['name'] as String, j['face_registered'] == true);
  }

  static Future<FaceResult> faceVerify(String nik, String photoB64) async =>
      FaceResult.fromJson(await _post('/api/mobile/face/verify', {'nik': nik, 'photo': photoB64}, timeout: const Duration(seconds: 40)));

  static Future<FaceResult> faceEnroll(String nik, String photoB64) async =>
      FaceResult.fromJson(await _post('/api/mobile/face/enroll', {'nik': nik, 'photo': photoB64}, timeout: const Duration(seconds: 40)));

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

  static Future<List<AreaStatus>> areaStatus(String nik, {double? lat, double? lng}) async {
    final j = await _post('/api/mobile/status', {'nik': nik, if (lat != null && lng != null) 'lat': lat, if (lat != null && lng != null) 'lng': lng});
    return ((j['statuses'] as List?) ?? []).map((e) => AreaStatus.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<List<MyReport>> myReports(String nik) async {
    final j = await _post('/api/mobile/my-reports', {'nik': nik});
    return (j['reports'] as List).map((e) => MyReport.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<List<NearbyItem>> nearby(double lat, double lng, {double radiusKm = 5}) async {
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

class Session extends ChangeNotifier {
  String? nik;
  String? name;
  String? faceToken;
  bool loaded = false;

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
    faceToken = p.getString('face_token');
    loaded = true;
    notifyListeners();
  }

  Future<void> signIn(String nik, String name, {String? faceToken}) async {
    final p = await SharedPreferences.getInstance();
    await p.setString('nik', nik);
    await p.setString('name', name);
    if (faceToken != null) await p.setString('face_token', faceToken);
    this.nik = nik;
    this.name = name;
    this.faceToken = faceToken;
    notifyListeners();
  }

  Future<void> signOut() async {
    final p = await SharedPreferences.getInstance();
    await p.remove('nik');
    await p.remove('name');
    await p.remove('face_token');
    nik = null;
    name = null;
    faceToken = null;
    notifyListeners();
  }
}

final session = Session();

String maskNik(String nik) => nik.length == 16 ? '${nik.substring(0, 4)} •••• •••• ${nik.substring(12)}' : nik;

class Place {
  const Place(this.lat, this.lng);
  final double lat, lng;
}

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
