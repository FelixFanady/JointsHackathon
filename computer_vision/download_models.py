import hashlib
import sys
import urllib.request
from pathlib import Path

MODELS = Path(__file__).parent / "models"
FILES = {
    "face_detection_yunet_2023mar.onnx": (
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    ),
    "face_recognition_sface_2021dec.onnx": (
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
        "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
    ),
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    MODELS.mkdir(exist_ok=True)
    for name, (url, digest) in FILES.items():
        dest = MODELS / name
        if dest.exists() and sha256(dest) == digest:
            print(f"ok      {name}")
            continue
        print(f"get     {name}")
        tmp = dest.with_suffix(".part")
        urllib.request.urlretrieve(url, tmp)
        got = sha256(tmp)
        if got != digest:
            tmp.unlink()
            print(f"FAILED  {name}: sha256 {got} != {digest}", file=sys.stderr)
            return 1
        tmp.replace(dest)
    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
