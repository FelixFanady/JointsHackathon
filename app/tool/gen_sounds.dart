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

void write(String path, List<double> s) {
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
}
