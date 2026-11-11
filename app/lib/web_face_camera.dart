import 'dart:js_interop';

import 'package:camera/camera.dart' show CameraException;
import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;

import 'face_sample.dart';

@JS('createSiagaKuFaceDetector')
external JSPromise<_FaceDetector> _createFaceDetector();

extension type _FaceDetector(JSObject _) implements JSObject {
  external _FaceFrame detect(web.HTMLVideoElement video, double timestamp);
  external void close();
}

extension type _FaceFrame(JSObject _) implements JSObject {
  external int get count;
  external double get size;
  external double get yaw;
  external double get pitch;
  external double get leftEyeOpen;
  external double get rightEyeOpen;
  external double get smile;
}

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
  _FaceDetector? _detector;
  double _lastVideoTime = -1;
  bool _disposed = false;

  Future<void> initialize() async {
    try {
      await _createFaceDetector().toDart.then((detector) {
        if (_disposed) {
          detector.close();
        } else {
          _detector = detector;
        }
      }).timeout(const Duration(seconds: 30));
    } catch (e) {
      debugPrint('web face detector initialization error: $e');
      throw CameraException('FaceDetectorUnavailable',
          'Pemeriksaan gerakan wajah tidak dapat dimuat. Coba lagi.');
    }
    if (_disposed) return;

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

  WebFaceFrame? detectFaces() {
    if (_stream?.active != true) {
      throw CameraException('CameraStopped', 'Kamera terputus. Coba lagi.');
    }
    final time = _video.currentTime;
    if (!_hasFrame || time == _lastVideoTime) return null;
    _lastVideoTime = time;
    final frame = _detector!.detect(_video, web.window.performance.now());
    return (
      count: frame.count,
      face: frame.count != 1
          ? null
          : (
              size: frame.size,
              yaw: frame.yaw,
              pitch: frame.pitch,
              leftEyeOpen: frame.leftEyeOpen,
              rightEyeOpen: frame.rightEyeOpen,
              smile: frame.smile,
            ),
    );
  }

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
    _stream = null;
    if (stream != null) {
      _stopTracks(stream);
      _video.srcObject = null;
    }
    final detector = _detector;
    _detector = null;
    detector?.close();
  }

  static void _stopTracks(web.MediaStream stream) {
    for (final track in stream.getTracks().toDart) {
      track.stop();
    }
  }
}
