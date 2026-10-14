"""SiagaKu face matching service -- INTERNAL ONLY.

Only the Next.js backend talks to this service. The phone never does, and nothing
here ever sends a face image back to a citizen:

  * Stateless: images arrive in the request, are processed in memory and dropped.
    Nothing is written to disk, nothing is cached, image bytes are never logged.
  * Every request must carry the shared secret in `x-cv-key` (CV_API_KEY env var).
    The service refuses to start without it.
  * Binds to 127.0.0.1 only. Do not put it behind a public port.

Models (OpenCV Zoo, Apache-2.0): YuNet for detection + landmarks, SFace for the
128-d embedding. SFace cosine similarity: >= 0.363 is OpenCV's "same person" cut-off
on LFW; the backend applies a stricter threshold on top of the raw score.

Run:  set CV_API_KEY=<long random string>
      python face_service.py
"""
from __future__ import annotations

import base64
import hmac
import os
import threading
from pathlib import Path

# Cap decoded image size BEFORE cv2 is imported (decompression-bomb guard).
os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", str(40_000_000))

import cv2  # noqa: E402
import numpy as np  # noqa: E402
from fastapi import Depends, FastAPI, Header, HTTPException, Request  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

HERE = Path(__file__).parent
DET_MODEL = HERE / "models" / "face_detection_yunet_2023mar.onnx"
REC_MODEL = HERE / "models" / "face_recognition_sface_2021dec.onnx"

API_KEY = os.environ.get("CV_API_KEY", "")
HOST = "127.0.0.1"
PORT = int(os.environ.get("CV_PORT", "8100"))

MAX_BODY = 8_000_000      # bytes, whole JSON request
MAX_B64 = 3_500_000       # chars, one image
MAX_EDGE = 640            # images are downscaled to this before detection
STORE_EDGE = 320          # enrolled reference photo is stored at this size
DET_SCORE = 0.80          # YuNet confidence to accept a face at all
GOOD_SCORE = 0.88         # stricter, for the live selfie
MIN_FACE_PX = 70          # live selfie: face box must be at least this wide (after downscale)
MIN_REF_FACE_PX = 40      # stored reference: may be a small website photo
SECOND_FACE_RATIO = 0.30  # a 2nd face >= 30% of the main face's area = "multiple faces"
MIN_SHARPNESS = 35.0      # variance of Laplacian on the face crop
MIN_BRIGHTNESS = 45.0     # mean gray level on the face crop
MAX_BRIGHTNESS = 225.0

if not API_KEY or len(API_KEY) < 24:
    raise SystemExit("CV_API_KEY must be set (24+ random characters). Refusing to start an open service.")
for m in (DET_MODEL, REC_MODEL):
    if not m.exists():
        raise SystemExit(f"Model missing: {m.name}. Run: python download_models.py")

_detector = cv2.FaceDetectorYN.create(str(DET_MODEL), "", (320, 320), DET_SCORE, 0.3, 50)
_recognizer = cv2.FaceRecognizerSF.create(str(REC_MODEL), "")
# The OpenCV objects keep per-call state (input size); FastAPI runs sync handlers in a thread pool.
_lock = threading.Lock()


class BadImage(Exception):
    pass


def decode(b64: str) -> np.ndarray:
    """base64 (optionally a data: URI) -> BGR image, downscaled to MAX_EDGE. Only JPEG/PNG/WebP."""
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[-1]
    if len(b64) > MAX_B64:
        raise BadImage("too_large")
    try:
        raw = base64.b64decode(b64, validate=True)
    except Exception as e:  # binascii.Error / ValueError
        raise BadImage("invalid_image") from e
    is_jpeg = raw[:3] == b"\xff\xd8\xff"
    is_png = raw[:8] == b"\x89PNG\r\n\x1a\n"
    is_webp = raw[:4] == b"RIFF" and raw[8:12] == b"WEBP"
    if not (is_jpeg or is_png or is_webp):
        raise BadImage("invalid_image")
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)  # applies EXIF orientation
    if img is None or img.size == 0:
        raise BadImage("invalid_image")
    h, w = img.shape[:2]
    if min(h, w) < 64:
        raise BadImage("too_small")
    scale = MAX_EDGE / max(h, w)
    if scale < 1:
        img = cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def detect(img: np.ndarray) -> list[np.ndarray]:
    """Faces (YuNet rows: x, y, w, h, 5 landmarks, score), largest first. Call under _lock."""
    h, w = img.shape[:2]
    _detector.setInputSize((w, h))
    _, faces = _detector.detect(img)
    if faces is None:
        return []
    return sorted(faces, key=lambda f: float(f[2] * f[3]), reverse=True)


def quality(img: np.ndarray, faces: list[np.ndarray], *, live: bool) -> str | None:
    """None when the main face is usable, else a reason code."""
    if not faces:
        return "no_face"
    main = faces[0]
    if len(faces) > 1 and faces[1][2] * faces[1][3] >= SECOND_FACE_RATIO * main[2] * main[3]:
        return "multiple_faces"
    if not live:
        return None if main[2] >= MIN_REF_FACE_PX else "face_too_small"
    if float(main[-1]) < GOOD_SCORE:
        return "face_unclear"
    if main[2] < MIN_FACE_PX:
        return "face_too_small"
    x, y, fw, fh = (int(v) for v in main[:4])
    ih, iw = img.shape[:2]
    if x < 0 or y < 0 or x + fw > iw or y + fh > ih:
        return "face_cut_off"
    crop = cv2.cvtColor(img[y:y + fh, x:x + fw], cv2.COLOR_BGR2GRAY)
    brightness = float(crop.mean())
    if brightness < MIN_BRIGHTNESS:
        return "too_dark"
    if brightness > MAX_BRIGHTNESS:
        return "too_bright"
    if float(cv2.Laplacian(crop, cv2.CV_64F).var()) < MIN_SHARPNESS:
        return "blurry"
    return None


def embed(img: np.ndarray, face: np.ndarray) -> np.ndarray:
    """Aligned 112x112 crop -> SFace feature. Call under _lock."""
    return _recognizer.feature(_recognizer.alignCrop(img, face))


def encode_jpeg(img: np.ndarray, edge: int) -> str:
    h, w = img.shape[:2]
    scale = edge / max(h, w)
    if scale < 1:
        img = cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 82])  # re-encode also strips EXIF/GPS
    if not ok:
        raise BadImage("invalid_image")
    return base64.b64encode(buf.tobytes()).decode("ascii")


# ---------------------------------------------------------------------------- HTTP

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def limit_body(request: Request, call_next):
    length = request.headers.get("content-length")
    if length is None or not length.isdigit() or int(length) > MAX_BODY:
        if request.method == "POST":
            return JSONResponse({"error": "body_too_large_or_unsized"}, status_code=413)
    return await call_next(request)


def require_key(x_cv_key: str = Header(default="")) -> None:
    if not hmac.compare_digest(x_cv_key.encode(), API_KEY.encode()):
        raise HTTPException(status_code=401, detail="unauthorized")


class EnrollIn(BaseModel):
    image: str = Field(min_length=100, max_length=MAX_B64 + 100)


class CompareIn(BaseModel):
    probe: str = Field(min_length=100, max_length=MAX_B64 + 100)
    reference: str = Field(min_length=100, max_length=MAX_B64 + 100)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/v1/enroll", dependencies=[Depends(require_key)])
def enroll(body: EnrollIn) -> dict:
    """Check a live selfie is a usable reference. Returns the re-encoded photo to STORE (backend only)."""
    try:
        img = decode(body.image)
        with _lock:
            faces = detect(img)
            reason = quality(img, faces, live=True)
            if reason is None:
                embed(img, faces[0])  # fails loudly now rather than at the first verify
        if reason:
            return {"ok": False, "reason": reason}
        return {"ok": True, "photo_jpeg_b64": encode_jpeg(img, STORE_EDGE)}
    except BadImage as e:
        return {"ok": False, "reason": str(e)}


@app.post("/v1/compare", dependencies=[Depends(require_key)])
def compare(body: CompareIn) -> dict:
    """Live selfie vs stored reference -> cosine similarity only. No image ever leaves this function."""
    try:
        probe = decode(body.probe)
    except BadImage as e:
        return {"ok": False, "reason": str(e)}
    try:
        ref = decode(body.reference)
    except BadImage:
        return {"ok": False, "reason": "reference_unusable"}
    with _lock:
        pf = detect(probe)
        reason = quality(probe, pf, live=True)
        if reason:
            return {"ok": False, "reason": reason}
        rf = detect(ref)
        if quality(ref, rf, live=False):
            return {"ok": False, "reason": "reference_unusable"}
        a = embed(probe, pf[0])
        b = embed(ref, rf[0])
        similarity = float(_recognizer.match(a, b, cv2.FaceRecognizerSF_FR_COSINE))
    return {"ok": True, "similarity": round(similarity, 4)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT, workers=1, access_log=False, server_header=False)
