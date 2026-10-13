import 'dart:convert';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Backend base URL. Override with: flutter run --dart-define=API_BASE=https://your-domain
/// Defaults target a Next.js dev server on the host machine (Android emulator uses 10.0.2.2).
String get apiBase {
  const fromEnv = String.fromEnvironment('API_BASE');
  if (fromEnv.isNotEmpty) return fromEnv;
  return !kIsWeb && Platform.isAndroid ? 'http://10.0.2.2:3000' : 'http://127.0.0.1:3000';
}

class ApiException implements Exception {
  ApiException(this.message);
  final String message;
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
        distanceKm = (j['distance_km'] as num).toDouble();
  final String id, kind, category, status, createdAt;
  final String? address;
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
        createdAt = j['created_at'] as String;
  final String id, kind, category, status, createdAt;
  final String? description, address;
}

class Api {
  static Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    try {
      final r = await http
          .post(Uri.parse('$apiBase$path'), headers: {'Content-Type': 'application/json'}, body: jsonEncode(body))
          .timeout(const Duration(seconds: 25));
      return _decode(r);
    } on ApiException {
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
    throw ApiException((j['error'] as String?) ?? 'Terjadi kesalahan (${r.statusCode}).');
  }

  /// Returns the citizen's name for a NIK.
  static Future<String> identify(String nik) async => (await _post('/api/mobile/identify', {'nik': nik}))['name'] as String;

  static Future<void> sendSos({required String nik, required double lat, required double lng, required String category, String? photoB64, String? address}) =>
      _post('/api/mobile/sos', {'nik': nik, 'lat': lat, 'lng': lng, 'category': category, 'photo': photoB64, 'address': address});

  static Future<void> sendReport({
    required String nik,
    required double lat,
    required double lng,
    required String category,
    required String description,
    required bool danger,
    String? photoB64,
    String? address,
  }) =>
      _post('/api/mobile/report', {
        'nik': nik, 'lat': lat, 'lng': lng, 'category': category,
        'description': description, 'danger': danger, 'photo': photoB64, 'address': address,
      });

  static Future<List<MyReport>> myReports(String nik) async {
    final j = await _post('/api/mobile/my-reports', {'nik': nik});
    return (j['reports'] as List).map((e) => MyReport.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<List<NearbyItem>> nearby(double lat, double lng, {double radiusKm = 5}) async {
    try {
      final r = await http
          .get(Uri.parse('$apiBase/api/mobile/nearby?lat=$lat&lng=$lng&radius_km=$radiusKm'))
          .timeout(const Duration(seconds: 20));
      final j = _decode(r);
      return (j['items'] as List).map((e) => NearbyItem.fromJson(e as Map<String, dynamic>)).toList();
    } on ApiException {
      rethrow;
    } catch (_) {
      throw ApiException('Tidak dapat terhubung ke server.');
    }
  }
}

/// Logged-in citizen, persisted on the device.
class Session extends ChangeNotifier {
  String? nik;
  String? name;
  bool loaded = false;

  bool get signedIn => nik != null && name != null;

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
