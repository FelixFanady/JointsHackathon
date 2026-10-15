import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';

import 'api.dart';

final reportsChanged = ValueNotifier<int>(0);
void notifyReportsChanged() => reportsChanged.value++;

mixin AutoRefresh<T extends StatefulWidget> on State<T>, WidgetsBindingObserver {
  Duration get autoRefreshEvery => const Duration(seconds: 20);
  Future<void> autoRefresh();

  Timer? _timer;
  bool _visible = true;
  bool _foreground = true;
  bool _running = false;
  DateTime _last = DateTime.now();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    reportsChanged.addListener(_now);
    _timer = Timer.periodic(autoRefreshEvery, (_) => _tick());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final visible = TickerMode.valuesOf(context).enabled;
    if (visible && !_visible) _maybeStale();
    _visible = visible;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final fg = state == AppLifecycleState.resumed;
    if (fg && !_foreground) _maybeStale();
    _foreground = fg;
  }

  @override
  void dispose() {
    _timer?.cancel();
    reportsChanged.removeListener(_now);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _tick() {
    if (_visible && _foreground) _run();
  }

  void _maybeStale() {
    if (DateTime.now().difference(_last) > const Duration(seconds: 5)) _run();
  }

  void _now() => _run();

  Future<void> _run() async {
    if (_running || !mounted) return;
    _running = true;
    try {
      await autoRefresh();
    } catch (_) {
    } finally {
      _last = DateTime.now();
      _running = false;
    }
  }
}

Place? _lastPlace;
DateTime? _lastPlaceAt;

Future<Place?> recentPlace() async {
  final at = _lastPlaceAt;
  if (_lastPlace != null && at != null && DateTime.now().difference(at) < const Duration(minutes: 2)) return _lastPlace;
  try {
    final perm = await Geolocator.checkPermission();
    if (perm != LocationPermission.whileInUse && perm != LocationPermission.always) return _lastPlace;
  } catch (_) {
    return _lastPlace;
  }
  final (p, _) = await currentPlace();
  if (p != null) rememberPlace(p);
  return p ?? _lastPlace;
}

void rememberPlace(Place p) {
  _lastPlace = p;
  _lastPlaceAt = DateTime.now();
}
