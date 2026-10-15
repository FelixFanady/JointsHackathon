import 'package:audioplayers/audioplayers.dart';

class SosSound {
  SosSound._();
  static final _players = <String, AudioPlayer>{};

  static AudioPlayer _player(String name) => _players.putIfAbsent(name, () {
        final p = AudioPlayer();
        p.setPlayerMode(PlayerMode.lowLatency);
        p.setReleaseMode(ReleaseMode.stop);
        return p;
      });

  static Future<void> preload() async {
    for (final n in const ['press', 'beep1', 'beep2', 'beep3', 'alarm']) {
      try {
        await _player(n).setSource(AssetSource('sounds/$n.wav'));
      } catch (_) {}
    }
  }

  static Future<void> play(String name) async {
    try {
      final p = _player(name);
      await p.stop();
      await p.play(AssetSource('sounds/$name.wav'));
    } catch (_) {}
  }
}
