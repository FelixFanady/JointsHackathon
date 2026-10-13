import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

/// One earthquake from BMKG's public feed (data.bmkg.go.id, no key needed).
class Quake {
  Quake({
    required this.time,
    required this.magnitude,
    required this.depth,
    required this.region,
    required this.potential,
    required this.felt,
    required this.distanceKm,
  });
  final DateTime time;
  final double magnitude;
  final String depth, region, potential, felt;
  final double distanceKm;

  bool get tsunamiRisk {
    final p = potential.toLowerCase();
    return p.contains('tsunami') && !p.contains('tidak');
  }
}

class Bmkg {
  static const _base = 'https://data.bmkg.go.id/DataMKG/TEWS';
  static List<_Raw>? _cache;
  static DateTime? _cachedAt;

  /// Nearest BMKG quake within [maxKm] that happened within [window] of [reportTime].
  /// Returns null when BMKG lists nothing that matches. Throws only when BMKG cannot be reached.
  static Future<Quake?> nearestFor({
    required double lat,
    required double lng,
    required DateTime reportTime,
    double maxKm = 300,
    Duration window = const Duration(hours: 6),
  }) async {
    final all = await _load();
    Quake? best;
    for (final q in all) {
      if ((q.time.difference(reportTime)).abs() > window) continue;
      final d = _distanceKm(lat, lng, q.lat, q.lng);
      if (d > maxKm) continue;
      if (best == null || d < best.distanceKm) {
        best = Quake(time: q.time, magnitude: q.mag, depth: q.depth, region: q.region, potential: q.potential, felt: q.felt, distanceKm: d);
      }
    }
    return best;
  }

  static Future<List<_Raw>> _load() async {
    if (_cache != null && _cachedAt != null && DateTime.now().difference(_cachedAt!) < const Duration(minutes: 2)) return _cache!;
    final out = <_Raw>[];
    var reached = false;
    // autogempa = latest, gempaterkini = 15 latest M5+, gempadirasakan = 15 latest felt.
    for (final f in const ['autogempa.json', 'gempaterkini.json', 'gempadirasakan.json']) {
      try {
        final r = await http.get(Uri.parse('$_base/$f')).timeout(const Duration(seconds: 10));
        if (r.statusCode != 200) continue;
        reached = true;
        final g = (jsonDecode(r.body) as Map<String, dynamic>)['Infogempa']?['gempa'];
        for (final e in (g is List ? g : [g])) {
          final q = _Raw.tryParse(e);
          if (q != null && !out.any((o) => o.time == q.time && o.region == q.region)) out.add(q);
        }
      } catch (_) {}
    }
    if (!reached) throw Exception('BMKG tidak dapat dihubungi');
    _cache = out;
    _cachedAt = DateTime.now();
    return out;
  }

  static double _distanceKm(double aLat, double aLng, double bLat, double bLng) {
    const r = 6371.0;
    double rad(double d) => d * pi / 180;
    final h = pow(sin(rad(bLat - aLat) / 2), 2) + cos(rad(aLat)) * cos(rad(bLat)) * pow(sin(rad(bLng - aLng) / 2), 2);
    return 2 * r * asin(sqrt(h));
  }
}

class _Raw {
  _Raw(this.time, this.lat, this.lng, this.mag, this.depth, this.region, this.potential, this.felt);
  final DateTime time;
  final double lat, lng, mag;
  final String depth, region, potential, felt;

  static _Raw? tryParse(dynamic e) {
    if (e is! Map) return null;
    final time = DateTime.tryParse('${e['DateTime'] ?? ''}');
    final coords = '${e['Coordinates'] ?? ''}'.split(',');
    final mag = double.tryParse('${e['Magnitude'] ?? ''}');
    if (time == null || coords.length != 2 || mag == null) return null;
    final lat = double.tryParse(coords[0].trim());
    final lng = double.tryParse(coords[1].trim());
    if (lat == null || lng == null) return null;
    return _Raw(time, lat, lng, mag, '${e['Kedalaman'] ?? ''}', '${e['Wilayah'] ?? ''}', '${e['Potensi'] ?? ''}', '${e['Dirasakan'] ?? ''}');
  }
}
