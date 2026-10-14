import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';

import 'api.dart';

/// Signals "reports changed" inside the app: fired right after this phone sends an SOS or a report,
/// so every list/map refreshes immediately instead of waiting for the next periodic refresh.
final reportsChanged = ValueNotifier<int>(0);
void notifyReportsChanged() => reportsChanged.value++;

/// Keeps a screen's data fresh without the user pulling to refresh:
/// - every [autoRefreshEvery] while the screen is the visible tab and the app is in the foreground,
/// - right away when the screen becomes visible again or the app comes back to the foreground,
/// - right away when this phone sends a new SOS / report ([reportsChanged]).
/// Implement [autoRefresh] as a SILENT reload (no spinners, keep scroll/map position).
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
    // The shell keeps every tab alive and disables tickers on hidden ones: use that as "visible".
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

  // Coming back to a tab / the app: refresh if the data is older than a few seconds.
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
      // silent: the next tick tries again
    } finally {
      _last = DateTime.now();
      _running = false;
    }
  }
}

Place? _lastPlace;
DateTime? _lastPlaceAt;

/// Position for background refreshes: reuses a fix younger than 2 minutes instead of waking the GPS
/// every 20 s. Never asks for permission (the visible screens do that).
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
