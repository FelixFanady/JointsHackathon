import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

import '../api.dart';
import '../face_sample.dart';
import '../theme.dart';
import '../web_face_camera_stub.dart'
    if (dart.library.js_interop) '../web_face_camera.dart';

class FaceScreen extends StatefulWidget {
  const FaceScreen({super.key, required this.nik, required this.name, required this.enroll});
  final String nik, name;
  final bool enroll;
  @override
  State<FaceScreen> createState() => _FaceScreenState();
}

enum _Step { center, blink, turn, smile, hold }

enum _Phase { starting, liveness, sending, matched, notMatched, error }

class _FaceScreenState extends State<FaceScreen> with WidgetsBindingObserver {
  static const _timeLimit = Duration(seconds: 30);

  CameraController? _cam;
  CameraDescription? _front;
  WebFaceCamera? _webCamera;
  Future<void> _cameraClosing = Future.value();
  bool _openingCamera = false;
  bool _cameraSuspended = false;
  final _detector = FaceDetector(
    options: FaceDetectorOptions(
      enableClassification: true,
      enableTracking: true,
      performanceMode: FaceDetectorMode.fast,
      minFaceSize: 0.25,
    ),
  );

  late bool _enroll = widget.enroll;
  _Phase _phase = _Phase.starting;
  List<_Step> _steps = const [];
  int _stepIndex = 0;
  int _okFrames = 0;
  int _blinkStage = 0;
  bool _gestureReady = false;
  int? _trackingId;
  String _hint = '';
  String? _message;
  double? _confidence;
  bool _canRetry = true;
  bool _busy = false;
  DateTime _lastFrame = DateTime.fromMillisecondsSinceEpoch(0);
  Timer? _deadline;
  Timer? _webFrames;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _deadline?.cancel();
    if (_openingCamera) {
      _webCamera?.dispose();
    } else {
      unawaited(_stopCamera());
    }
    if (!kIsWeb) _detector.close();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // The browser permission prompt can take focus while the tab stays visible.
    if (state == AppLifecycleState.hidden ||
        (!kIsWeb && (state == AppLifecycleState.inactive || state == AppLifecycleState.paused))) {
      _cameraSuspended = true;
      _deadline?.cancel();
      if (_phase == _Phase.liveness) {
        setState(() {
          _phase = _Phase.starting;
          _hint = 'Menyiapkan kamera…';
        });
      }
      if (!_openingCamera) unawaited(_stopCamera());
    } else if (state == AppLifecycleState.resumed && _cameraSuspended) {
      _cameraSuspended = false;
      if (_phase == _Phase.starting) unawaited(_start());
    }
  }

  Future<void> _stopCamera() {
    _webFrames?.cancel();
    _webCamera?.dispose();
    _webCamera = null;
    final c = _cam;
    _cam = null;
    if (c != null) _cameraClosing = _disposeCamera(c);
    return _cameraClosing;
  }

  Future<void> _disposeCamera(CameraController c) async {
    try {
      if (c.value.isStreamingImages) await c.stopImageStream();
    } catch (_) {}
    try {
      await c.dispose();
    } catch (e) {
      debugPrint('camera dispose error: $e');
    }
  }

  bool get _canOpenCamera => mounted && !_cameraSuspended;

  Future<void> _start() async {
    if (!_canOpenCamera || _openingCamera) return;
    _openingCamera = true;
    final rest = [_Step.blink, _Step.turn, _Step.smile]..shuffle(Random.secure());
    setState(() {
      _phase = _Phase.starting;
      _steps = [_Step.center, ...rest.take(2), _Step.hold];
      _stepIndex = 0;
      _okFrames = 0;
      _blinkStage = 0;
      _gestureReady = false;
      _trackingId = null;
      _message = null;
      _confidence = null;
      _canRetry = true;
      _hint = kIsWeb ? 'Menyiapkan pemeriksaan wajah…' : 'Menyiapkan kamera…';
    });
    try {
      await _stopCamera();
      if (!_canOpenCamera) return;
      if (kIsWeb) {
        final camera = WebFaceCamera();
        _webCamera = camera;
        await camera.initialize();
      } else {
        _front ??= (await availableCameras()).firstWhere(
          (c) => c.lensDirection == CameraLensDirection.front,
          orElse: () => throw CameraException('NoFrontCamera', 'Kamera depan tidak ditemukan.'),
        );
        if (!_canOpenCamera) return;
        final cam = CameraController(
          _front!,
          ResolutionPreset.medium,
          enableAudio: false,
          imageFormatGroup: Platform.isAndroid ? ImageFormatGroup.nv21 : ImageFormatGroup.bgra8888,
        );
        _cam = cam;
        await cam.initialize();
        if (!_canOpenCamera) return;
        await cam.startImageStream(_onFrame);
      }
      if (!_canOpenCamera) return;
      _deadline?.cancel();
      _deadline = Timer(_timeLimit, () {
        if (_phase == _Phase.liveness) _fail('Waktu habis. Ikuti petunjuk di layar lalu coba lagi.');
      });
      setState(() {
        _phase = _Phase.liveness;
        _hint = _hintFor(_steps.first);
      });
      final webCamera = _webCamera;
      if (webCamera != null) {
        _webFrames = Timer.periodic(const Duration(milliseconds: 60), (_) => _onWebFrame(webCamera));
      }
    } on CameraException catch (e) {
      final denied = e.code.contains('Denied') || e.code.contains('denied');
      if (_canOpenCamera) _fail(denied ? 'Izin kamera ditolak. Izinkan kamera di pengaturan aplikasi.' : (e.description ?? 'Kamera tidak dapat dibuka.'));
    } catch (_) {
      if (_canOpenCamera) _fail('Kamera tidak dapat dibuka.');
    } finally {
      if (_phase != _Phase.liveness || !_canOpenCamera) await _stopCamera();
      _openingCamera = false;
      if (_phase == _Phase.starting && _canOpenCamera) unawaited(_start());
    }
  }

  void _fail(String msg, {bool canRetry = true}) {
    _deadline?.cancel();
    unawaited(_stopCamera());
    if (!mounted) return;
    setState(() {
      _phase = _Phase.error;
      _message = msg;
      _canRetry = canRetry;
    });
  }

  String _hintFor(_Step s) => switch (s) {
        _Step.center => 'Posisikan wajah di dalam lingkaran',
        _Step.blink => 'Kedipkan mata',
        _Step.turn => 'Tolehkan kepala perlahan ke samping',
        _Step.smile => 'Tersenyum',
        _Step.hold => 'Tatap kamera dan tahan sebentar',
      };


  Future<void> _onFrame(CameraImage image) async {
    if (_busy || _phase != _Phase.liveness) return;
    final now = DateTime.now();
    if (now.difference(_lastFrame).inMilliseconds < 120) return;
    _busy = true;
    _lastFrame = now;
    try {
      final input = _toInputImage(image);
      if (input == null) return;
      final faces = await _detector.processImage(input);
      if (!mounted || _phase != _Phase.liveness) return;
      _evaluate(faces, min(image.width, image.height).toDouble());
    } catch (e) {
      debugPrint('face frame error: $e');
    } finally {
      _busy = false;
    }
  }

  void _onWebFrame(WebFaceCamera camera) {
    if (_phase != _Phase.liveness) return;
    try {
      final frame = camera.detectFaces();
      if (frame == null) return;
      final face = frame.face;
      if (face == null) {
        _stepIndex = 0;
        _okFrames = 0;
        _blinkStage = 0;
        _gestureReady = false;
        _showStepHint(frame.count > 1 ? 'Pastikan hanya satu wajah di kamera' : 'Wajah tidak terlihat');
      } else {
        _showStepHint(_advance(face));
      }
    } catch (e) {
      debugPrint('web face frame error: $e');
      _fail(e is CameraException
          ? (e.description ?? 'Kamera tidak dapat dibaca. Coba lagi.')
          : 'Pemeriksaan gerakan wajah gagal. Coba lagi.');
    }
  }

  void _evaluate(List<Face> faces, double shortSide) {
    String? hint;
    if (faces.isEmpty) {
      hint = 'Wajah tidak terlihat';
    } else if (faces.length > 1) {
      hint = 'Pastikan hanya satu wajah di kamera';
    } else {
      final f = faces.first;
      if (_trackingId != null && f.trackingId != null && f.trackingId != _trackingId) {
        _stepIndex = 0;
        _okFrames = 0;
        _blinkStage = 0;
        _trackingId = f.trackingId;
        hint = 'Wajah berganti. Ulangi dari awal.';
      } else {
        _trackingId ??= f.trackingId;
        hint = _advance((
          yaw: f.headEulerAngleY ?? 0,
          pitch: f.headEulerAngleX ?? 0,
          size: f.boundingBox.width / shortSide,
          leftEyeOpen: f.leftEyeOpenProbability,
          rightEyeOpen: f.rightEyeOpenProbability,
          smile: f.smilingProbability ?? 0,
        ));
      }
    }
    _showStepHint(hint);
  }

  void _showStepHint(String? hint) {
    if (_phase == _Phase.liveness) setState(() => _hint = hint ?? _hintFor(_steps[_stepIndex]));
  }

  String? _advance(FaceSample face) {
    final (:yaw, :pitch, :size, leftEyeOpen: left, rightEyeOpen: right, :smile) = face;
    final centred = yaw.abs() < 12 && pitch.abs() < 15;
    final step = _steps[_stepIndex];

    if (step == _Step.center || step == _Step.hold) {
      if (kIsWeb && (size < 0.30 || size > 0.95 || !centred)) _okFrames = 0;
      if (size < 0.30) return 'Dekatkan wajah ke kamera';
      if (size > 0.95) return 'Jauhkan sedikit wajah dari kamera';
      if (!centred) return 'Hadapkan wajah lurus ke kamera';
    }

    var done = false;
    switch (step) {
      case _Step.center:
        done = ++_okFrames >= 3;
      case _Step.blink:
        if (left == null || right == null) return 'Pastikan mata terlihat jelas';
        final open = left > (kIsWeb ? 0.7 : 0.6) && right > (kIsWeb ? 0.7 : 0.6);
        final closed = left < (kIsWeb ? 0.5 : 0.25) && right < (kIsWeb ? 0.5 : 0.25);
        if (_blinkStage == 0 && open) _blinkStage = 1;
        if (_blinkStage == 1 && closed) _blinkStage = 2;
        done = _blinkStage == 2 && open;
      case _Step.turn:
        if (kIsWeb && centred) _gestureReady = true;
        done = (!kIsWeb || _gestureReady) && yaw.abs() > 25;
      case _Step.smile:
        if (kIsWeb && smile < 0.25) _gestureReady = true;
        done = (!kIsWeb || _gestureReady) && smile > (kIsWeb ? 0.5 : 0.8);
      case _Step.hold:
        final eyesOpen = (left ?? 1) > 0.5 && (right ?? 1) > 0.5;
        if (!eyesOpen) {
          if (kIsWeb) _okFrames = 0;
          return 'Buka mata Anda';
        }
        done = ++_okFrames >= (kIsWeb ? 7 : 4);
    }
    if (done) {
      HapticFeedback.lightImpact();
      _okFrames = 0;
      _gestureReady = false;
      if (_stepIndex == _steps.length - 1) {
        _captureAndSend();
      } else {
        _stepIndex++;
      }
    }
    return null;
  }

  InputImage? _toInputImage(CameraImage image) {
    final cam = _cam;
    final front = _front;
    if (cam == null || front == null) return null;
    final sensor = front.sensorOrientation;
    InputImageRotation? rotation;
    if (Platform.isIOS) {
      rotation = InputImageRotationValue.fromRawValue(sensor);
    } else {
      const degrees = {
        DeviceOrientation.portraitUp: 0,
        DeviceOrientation.landscapeLeft: 90,
        DeviceOrientation.portraitDown: 180,
        DeviceOrientation.landscapeRight: 270,
      };
      final device = degrees[cam.value.deviceOrientation];
      if (device == null) return null;
      rotation = InputImageRotationValue.fromRawValue((sensor + device) % 360);
    }
    if (rotation == null) return null;

    final size = Size(image.width.toDouble(), image.height.toDouble());
    if (Platform.isAndroid) {
      final bytes = image.planes.length == 1 ? image.planes.first.bytes : _yuv420ToNv21(image);
      return InputImage.fromBytes(
        bytes: bytes,
        metadata: InputImageMetadata(size: size, rotation: rotation, format: InputImageFormat.nv21, bytesPerRow: image.planes.length == 1 ? image.planes.first.bytesPerRow : image.width),
      );
    }
    if (image.planes.length != 1) return null;
    final p = image.planes.first;
    return InputImage.fromBytes(
      bytes: p.bytes,
      metadata: InputImageMetadata(size: size, rotation: rotation, format: InputImageFormat.bgra8888, bytesPerRow: p.bytesPerRow),
    );
  }

  static Uint8List _yuv420ToNv21(CameraImage image) {
    final w = image.width, h = image.height;
    final y = image.planes[0], u = image.planes[1], v = image.planes[2];
    final out = Uint8List(w * h + 2 * (w ~/ 2) * (h ~/ 2));
    var i = 0;
    for (var row = 0; row < h; row++) {
      out.setRange(i, i + w, y.bytes, row * y.bytesPerRow);
      i += w;
    }
    final up = u.bytesPerPixel ?? 1, vp = v.bytesPerPixel ?? 1;
    for (var row = 0; row < h ~/ 2; row++) {
      for (var col = 0; col < w ~/ 2; col++) {
        out[i++] = v.bytes[row * v.bytesPerRow + col * vp];
        out[i++] = u.bytes[row * u.bytesPerRow + col * up];
      }
    }
    return out;
  }


  Future<void> _captureAndSend() async {
    final cam = _cam;
    final webCamera = _webCamera;
    if (_phase != _Phase.liveness || (cam == null && webCamera == null)) return;
    _deadline?.cancel();
    setState(() {
      _phase = _Phase.sending;
      _hint = 'Mencocokkan wajah…';
    });
    String b64;
    try {
      if (webCamera != null) {
        b64 = webCamera.takePictureBase64();
      } else {
        if (cam!.value.isStreamingImages) await cam.stopImageStream();
        final shot = await cam.takePicture();
        final bytes = await shot.readAsBytes();
        unawaited(File(shot.path).delete().then((_) {}, onError: (_) {}));
        b64 = base64Encode(bytes);
      }
    } catch (_) {
      _fail('Gagal mengambil foto. Coba lagi.');
      return;
    }
    await _stopCamera();
    if (!mounted) return;

    try {
      final r = _enroll ? await Api.faceEnroll(widget.nik, b64) : await Api.faceVerify(widget.nik, b64);
      if (!mounted) return;
      setState(() {
        _confidence = r.confidence;
        _phase = r.match ? _Phase.matched : _Phase.notMatched;
      });
      if (r.match && r.token != null) {
        HapticFeedback.mediumImpact();
        await Future.delayed(const Duration(milliseconds: 1100));
        if (mounted) Navigator.of(context).pop(r.token);
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      switch (e.code) {
        case 'not_registered':
          setState(() => _enroll = true);
          _start();
        case 'already_registered':
          setState(() => _enroll = false);
          _start();
        case 'face_locked':
        case 'reference_unusable':
        case 'inactive':
          _fail(e.message, canRetry: false);
        default:
          _fail(e.message);
      }
    }
  }


  Color get _ringColor => switch (_phase) {
        _Phase.matched => C.ok,
        _Phase.notMatched || _Phase.error => C.emergency,
        _ => C.primary,
      };

  @override
  Widget build(BuildContext context) {
    const d = 260.0;
    final cam = _cam;
    Widget? preview;
    if (_phase == _Phase.liveness) {
      preview = _webCamera?.buildPreview();
      if (cam != null) {
        preview = FittedBox(
          fit: BoxFit.cover,
          child: SizedBox(width: d, height: d * cam.value.aspectRatio, child: CameraPreview(cam)),
        );
      }
    }
    final progress = _steps.isEmpty ? 0.0 : (_phase == _Phase.liveness ? _stepIndex / _steps.length : (_phase == _Phase.starting ? 0.0 : 1.0));

    return Scaffold(
      appBar: AppBar(title: Text(_enroll ? 'Daftarkan Wajah' : 'Verifikasi Wajah')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Column(children: [
            Text(
              _enroll ? 'Belum ada foto wajah untuk ${widget.name}. Daftarkan sekali, berikutnya cukup verifikasi.' : 'Wajah Anda dicocokkan dengan foto profil yang terdaftar.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: C.muted, fontSize: 13),
            ),
            const SizedBox(height: 20),
            Stack(alignment: Alignment.center, children: [
              SizedBox(
                width: d + 16,
                height: d + 16,
                child: CircularProgressIndicator(value: _phase == _Phase.starting || _phase == _Phase.sending ? null : progress, strokeWidth: 6, color: _ringColor, backgroundColor: C.field),
              ),
              ClipOval(
                child: SizedBox(
                  width: d,
                  height: d,
                  child: preview ?? Container(color: C.field, child: Icon(_resultIcon, size: 96, color: _ringColor)),
                ),
              ),
            ]),
            const SizedBox(height: 24),
            Text(_title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -.3)),
            const SizedBox(height: 8),
            if (_subtitle != null) Text(_subtitle!, textAlign: TextAlign.center, style: const TextStyle(fontSize: 14, color: C.muted)),
            if (_phase == _Phase.liveness) ...[
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i < _steps.length; i++)
                    Container(
                      width: 10,
                      height: 10,
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      decoration: BoxDecoration(shape: BoxShape.circle, color: i < _stepIndex ? C.ok : (i == _stepIndex ? C.primary : C.outline)),
                    ),
                ],
              ),
            ],
            const Spacer(),
            if (_phase == _Phase.notMatched || _phase == _Phase.error) ...[
              if (_canRetry) PrimaryButton(label: 'Coba Lagi', icon: Icons.refresh, onPressed: _start),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Kembali', style: TextStyle(fontWeight: FontWeight.w600, color: C.primary)),
              ),
            ],
            const SizedBox(height: 8),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Icon(Icons.lock_outline, size: 14, color: C.muted),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  _enroll
                      ? 'Foto disimpan terenkripsi sebagai foto profil Anda dan hanya dapat dilihat petugas.'
                      : 'Foto hanya dipakai untuk pencocokan dan tidak disimpan.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 12, color: C.muted),
                ),
              ),
            ]),
          ]),
        ),
      ),
    );
  }

  IconData get _resultIcon => switch (_phase) {
        _Phase.matched => Icons.verified_user,
        _Phase.notMatched => Icons.no_accounts,
        _Phase.error => Icons.error_outline,
        _ => Icons.face_retouching_natural,
      };

  String get _title => switch (_phase) {
        _Phase.starting || _Phase.liveness => _hint,
        _Phase.sending => _enroll ? 'Mendaftarkan wajah…' : 'Mencocokkan wajah…',
        _Phase.matched => _enroll ? 'Wajah terdaftar' : 'Wajah cocok',
        _Phase.notMatched => 'Wajah tidak cocok',
        _Phase.error => 'Belum berhasil',
      };

  String? get _subtitle {
    final pct = _confidence == null ? null : '${(_confidence! * 100).round()}%';
    return switch (_phase) {
      _Phase.liveness => 'Langkah ${_stepIndex + 1} dari ${_steps.length}',
      _Phase.matched => _enroll ? 'Masuk sebagai ${widget.name}…' : 'Tingkat kecocokan $pct',
      _Phase.notMatched => 'Tingkat kecocokan $pct. Pastikan wajah terang, tanpa masker, lalu coba lagi.',
      _Phase.error => _message,
      _ => null,
    };
  }
}
