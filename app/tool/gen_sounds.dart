// Generates the SOS button sounds as 16-bit mono WAV (44.1 kHz).
// Run from app/: dart run tool/gen_sounds.dart
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

const rate = 44100;

/// Envelope: quick attack, smooth release, so beeps don't click.
double env(double t, double dur, {double a = .006, double r = .05}) {
  if (t < a) return t / a;
  if (t > dur - r) return max(0, (dur - t) / r);
  return 1;
}

List<double> tone(double freq, double dur, {double vol = .6, double harm = .25, double r = .05}) {
  final n = (rate * dur).round();
  return List.generate(n, (i) {
    final t = i / rate;
    final s = sin(2 * pi * freq * t) + harm * sin(4 * pi * freq * t);
    return vol * env(t, dur, r: r) * s / (1 + harm);
  });
}

/// Soft "tuk" when the finger touches the button: pitch drops fast.
List<double> press() {
  const dur = .09;
  final n = (rate * dur).round();
  var phase = 0.0;
  return List.generate(n, (i) {
    final t = i / rate;
    final f = 620 - 300 * (t / dur);
    phase += 2 * pi * f / rate;
    return .7 * env(t, dur, a: .002, r: .06) * sin(phase);
  });
}

/// Two-tone rising siren for the moment SOS is activated.
List<double> alarm() {
  final out = <double>[];
  for (var k = 0; k < 3; k++) {
    out.addAll(tone(880, .16, vol: .7, r: .02));
    out.addAll(tone(1320, .16, vol: .7, r: .02));
  }
  out.addAll(tone(1760, .35, vol: .7, r: .2));
  return out;
}

// --- Notification sirens (Android res/raw). Lower sample rate keeps the 30 s file small. ---
const nrate = 22050;

/// Rich siren voice: fundamental + odd harmonics (horn-like), from a running phase.
double _voice(double phase) => sin(phase) + .35 * sin(3 * phase) + .15 * sin(5 * phase);

/// Civil-defence disaster siren: slow wail rising and falling, ~30 s, played once.
List<double> disasterSiren({double dur = 30}) {
  final n = (nrate * dur).round();
  var phase = 0.0;
  const cycle = 7.0; // seconds per rise+fall
  return List.generate(n, (i) {
    final t = i / nrate;
    final c = (t % cycle) / cycle; // 0..1
    final shape = c < .55 ? sin(c / .55 * pi / 2) : cos((c - .55) / .45 * pi / 2); // rise slow, fall
    final f = 320 + 520 * shape;
    phase += 2 * pi * f / nrate;
    final fade = min(1.0, min(t / .6, (dur - t) / 1.2)).clamp(0.0, 1.0);
    return .55 * fade * _voice(phase) / 1.5;
  });
}

/// Police siren: fast "wiu-wiu" yelp, ~3.5 s, played once.
List<double> policeSiren({double dur = 3.6}) {
  final n = (nrate * dur).round();
  var phase = 0.0;
  const cycle = .42;
  return List.generate(n, (i) {
    final t = i / nrate;
    final c = (t % cycle) / cycle;
    final shape = c < .5 ? c * 2 : (1 - c) * 2; // triangle sweep up/down
    final f = 700 + 750 * shape;
    phase += 2 * pi * f / nrate;
    final fade = min(1.0, min(t / .05, (dur - t) / .3)).clamp(0.0, 1.0);
    return .6 * fade * _voice(phase) / 1.5;
  });
}

void write(String path, List<double> s, {int rate = rate}) {
  final data = ByteData(44 + s.length * 2);
  void str(int o, String v) { for (var i = 0; i < v.length; i++) { data.setUint8(o + i, v.codeUnitAt(i)); } }
  str(0, 'RIFF'); data.setUint32(4, 36 + s.length * 2, Endian.little); str(8, 'WAVE');
  str(12, 'fmt '); data.setUint32(16, 16, Endian.little); data.setUint16(20, 1, Endian.little);
  data.setUint16(22, 1, Endian.little); data.setUint32(24, rate, Endian.little);
  data.setUint32(28, rate * 2, Endian.little); data.setUint16(32, 2, Endian.little); data.setUint16(34, 16, Endian.little);
  str(36, 'data'); data.setUint32(40, s.length * 2, Endian.little);
  for (var i = 0; i < s.length; i++) {
    data.setInt16(44 + i * 2, (s[i].clamp(-1.0, 1.0) * 32767).round(), Endian.little);
  }
  File(path)..createSync(recursive: true)..writeAsBytesSync(data.buffer.asUint8List());
  stdout.writeln('wrote $path (${s.length / rate}s)');
}

void main() {
  write('assets/sounds/press.wav', press());
  // Countdown beeps get higher each second: 3 -> 2 -> 1.
  write('assets/sounds/beep1.wav', tone(660, .14));
  write('assets/sounds/beep2.wav', tone(880, .14));
  write('assets/sounds/beep3.wav', tone(1100, .14));
  write('assets/sounds/alarm.wav', alarm());
  // Notification sounds must live in Android res/raw (referenced by name from notifier.dart).
  write('android/app/src/main/res/raw/siren_disaster.wav', disasterSiren(), rate: nrate);
  write('android/app/src/main/res/raw/siren_police.wav', policeSiren(), rate: nrate);
}
