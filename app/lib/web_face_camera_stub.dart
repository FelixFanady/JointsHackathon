import 'package:flutter/widgets.dart';

import 'face_sample.dart';

class WebFaceCamera {
  Future<void> initialize() => throw UnsupportedError('Web camera');
  Widget buildPreview() => throw UnsupportedError('Web camera');
  WebFaceFrame? detectFaces() => throw UnsupportedError('Web camera');
  String takePictureBase64() => throw UnsupportedError('Web camera');
  void dispose() {}
}
