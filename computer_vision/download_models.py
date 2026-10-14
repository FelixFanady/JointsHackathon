"""Download the two ONNX models (OpenCV Zoo, Apache-2.0) into ./models.

  YuNet  -- face detection + 5 landmarks (~230 KB)
  SFace  -- face recognition, 128-d embedding (~37 MB)

Run once:  python download_models.py
"""
import sys
import urllib.request
from pathlib import Path

MODELS = Path(__file__).parent / "models"
FILES = {
    "face_detection_yunet_2023mar.onnx":
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "face_recognition_sface_2021dec.onnx":
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
}
# A git-LFS pointer file is ~130 bytes; a real model is far larger.
MIN_BYTES = 100_000


def main() -> int:
    MODELS.mkdir(exist_ok=True)
    for name, url in FILES.items():
        dest = MODELS / name
        if dest.exists() and dest.stat().st_size > MIN_BYTES:
            print(f"ok      {name}")
            continue
        print(f"get     {name}")
        tmp = dest.with_suffix(".part")
        urllib.request.urlretrieve(url, tmp)
        if tmp.stat().st_size < MIN_BYTES:
            tmp.unlink()
            print(f"FAILED  {name}: download too small (LFS pointer?)", file=sys.stderr)
            return 1
        tmp.replace(dest)
    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
