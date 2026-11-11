typedef FaceSample = ({
  double size,
  double yaw,
  double pitch,
  double? leftEyeOpen,
  double? rightEyeOpen,
  double smile,
});

typedef WebFaceFrame = ({int count, FaceSample? face});
