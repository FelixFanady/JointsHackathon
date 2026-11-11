import 'dart:js_interop';

import 'package:camera/camera.dart' show CameraException;
import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;

class WebFaceCamera {
  static const _haveCurrentData = 2;

  final _video = web.HTMLVideoElement()
    ..muted = true
    ..playsInline = true
    ..style.width = '100%'
    ..style.height = '100%'
    ..style.objectFit = 'cover'
    ..style.transform = 'scaleX(-1)';
  web.MediaStream? _stream;
  bool _disposed = false;

  Future<void> initialize() async {
    final stream = await _openStream();
    if (_disposed) {
      _stopTracks(stream);
      return;
    }

    _stream = stream;
    _video.srcObject = stream;
    await _video.play().toDart.timeout(const Duration(seconds: 10));
    if (!_disposed && !_hasFrame) {
      throw CameraException('NoFrame', 'Gambar dari kamera belum tersedia.');
    }
  }

  Future<web.MediaStream> _openStream() async {
    try {
      return await web.window.navigator.mediaDevices
          .getUserMedia(web.MediaStreamConstraints(
            video: web.MediaTrackConstraints(
              facingMode: web.ConstrainDOMStringParameters(ideal: 'user'.toJS),
              width: web.ConstrainULongRange(ideal: 640),
              height: web.ConstrainULongRange(ideal: 480),
            ),
            audio: false.toJS,
          ))
          .toDart;
    } catch (error) {
      final jsError = error as JSAny;
      if (!jsError.isA<web.DOMException>()) rethrow;
      final name = (jsError as web.DOMException).name;
      final message = switch (name) {
        'NotAllowedError' => 'Izinkan akses kamera di browser, lalu coba lagi.',
        'NotFoundError' => 'Kamera tidak ditemukan.',
        'NotReadableError' ||
        'TrackStartError' =>
          'Kamera tidak dapat dibuka. Tutup aplikasi atau tab lain yang memakai kamera, lalu coba lagi.',
        _ => 'Kamera tidak dapat dibuka.',
      };
      throw CameraException(name, message);
    }
  }

  bool get _hasFrame =>
      _video.readyState >= _haveCurrentData &&
      _video.videoWidth > 0 &&
      _video.videoHeight > 0;

  Widget buildPreview() => HtmlElementView.fromTagName(
        tagName: 'div',
        onElementCreated: (element) =>
            (element as web.HTMLDivElement).appendChild(_video),
      );

  String takePictureBase64() {
    if (!_hasFrame || _stream?.active != true) {
      throw CameraException('NoFrame', 'Gambar dari kamera belum tersedia.');
    }
    final canvas = web.HTMLCanvasElement()
      ..width = _video.videoWidth
      ..height = _video.videoHeight;
    canvas.context2D
      ..translate(canvas.width, 0)
      ..scale(-1, 1)
      ..drawImage(_video, 0, 0);
    final photo = canvas.toDataURL('image/jpeg');
    return photo.substring(photo.indexOf(',') + 1);
  }

  void dispose() {
    _disposed = true;
    final stream = _stream;
    if (stream == null) return;
    _stream = null;
    _stopTracks(stream);
    _video.srcObject = null;
  }

  static void _stopTracks(web.MediaStream stream) {
    for (final track in stream.getTracks().toDart) {
      track.stop();
    }
  }
}
