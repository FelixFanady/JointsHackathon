// The SDK and the MediaPipe Face Landmarker float16/1 model are served by the app.
const faceLandmarkerAssets = new URL('/face-landmarker/', document.baseURI);

window.createSiagaKuFaceDetector = async () => {
  const { FaceLandmarker, FilesetResolver } = await import(new URL('vision_bundle.mjs', faceLandmarkerAssets));
  const files = await FilesetResolver.forVisionTasks(new URL('wasm', faceLandmarkerAssets).href);
  const detector = await FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: new URL('face_landmarker.task', faceLandmarkerAssets).href },
    runningMode: 'VIDEO',
    numFaces: 2,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });

  return {
    detect(video, timestamp) {
      const result = detector.detectForVideo(video, timestamp);
      const count = result.faceLandmarks.length;
      if (count !== 1) return { count };

      const matrix = result.facialTransformationMatrixes[0]?.data;
      const categories = result.faceBlendshapes[0]?.categories;
      if (!matrix || !categories) return { count: 0 };

      const x = result.faceLandmarks[0].map((point) => point.x);
      const size = (Math.max(...x) - Math.min(...x)) * video.videoWidth /
        Math.min(video.videoWidth, video.videoHeight);
      const degrees = 180 / Math.PI;
      // MediaPipe packs the matrix column-major. Column three is the forward axis.
      const [forwardX, forwardY, forwardZ] = matrix.slice(8, 11);
      const yaw = Math.atan2(forwardX, forwardZ) * degrees;
      const pitch = Math.atan2(-forwardY, Math.hypot(forwardX, forwardZ)) * degrees;
      const score = (name) => categories.find((category) => category.categoryName === name)?.score;
      const leftBlink = score('eyeBlinkLeft');
      const rightBlink = score('eyeBlinkRight');
      const smile = Math.min(score('mouthSmileLeft'), score('mouthSmileRight'));
      if (![size, yaw, pitch, leftBlink, rightBlink, smile].every(Number.isFinite)) return { count: 0 };
      return { count, size, yaw, pitch, leftEyeOpen: 1 - leftBlink, rightEyeOpen: 1 - rightBlink, smile };
    },
    close() {
      detector.close();
    },
  };
};
