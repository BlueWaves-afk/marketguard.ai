# main.py
# Deepfake / Image Detection API (FastAPI)
# - Hybrid inputs (multipart, data_url, URL) for images & videos
# - Video frame sampling (requires opencv-python if available)
# - OCR endpoint preserved (optional, lazy-initialized)
# -------------------------------------------------------------

from __future__ import annotations

import base64
import hashlib
import io
import os
import re
import tempfile
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import requests
from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image

# Optional: OpenCV for video support
try:
  import cv2  # type: ignore
  HAS_CV2 = True
except Exception:
  HAS_CV2 = False

# Optional: easyocr for OCR (keep lazy import)
try:
  import easyocr  # type: ignore
  HAS_EASYOCR = True
except Exception:
  HAS_EASYOCR = False

# -------------------------------------------------------------
# App Initialization
# -------------------------------------------------------------
app = FastAPI(title="Deepfake / Image Detection API")

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],          # tighten for production
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

MAX_DOWNLOAD_BYTES   = int(os.environ.get("MAX_DOWNLOAD_BYTES", 10 * 1024 * 1024))  # 10 MB
MAX_DOWNLOAD_TIMEOUT = float(os.environ.get("MAX_DOWNLOAD_TIMEOUT", 10.0))          # seconds
VIDEO_MAX_FRAMES     = int(os.environ.get("VIDEO_MAX_FRAMES", 16))
VIDEO_FPS_SAMPLE     = float(os.environ.get("VIDEO_FPS_SAMPLE", 1.0))               # frames per second to sample

# -------------------------------------------------------------
# Models
# -------------------------------------------------------------
class Risk(BaseModel):
  level: str = Field("UNKNOWN", description="Classifier label or bucket")
  score: float = Field(0.0, ge=0.0, le=1.0, description="[0..1] confidence or risk score")
  reasons: List[str] = Field(default_factory=list)

class ImageDetectResponse(BaseModel):
  media_type: str = "image"
  width: int
  height: int
  sha256: str
  risk: Risk
  model: str = "stub"
  version: str = "0.1"

class FrameResult(BaseModel):
  index: int
  time_sec: float
  width: int
  height: int
  risk: Risk

class VideoDetectResponse(BaseModel):
  media_type: str = "video"
  frames_evaluated: int
  frame_results: List[FrameResult]
  aggregate: Risk
  model: str = "stub"
  version: str = "0.1"

class OCRResponse(BaseModel):
  paragraphs: List[str]

class DataURLPayload(BaseModel):
  data_url: str = Field(..., description="data URL, e.g. data:image/png;base64,AAAA...")
  meta: Optional[Dict[str, Any]] = None

# -------------------------------------------------------------
# Globals (lazy-initialized OCR reader)
# -------------------------------------------------------------
_easy_reader: Optional[Any] = None  # initialized on first OCR call

# -------------------------------------------------------------
# Utils
# -------------------------------------------------------------
# Allow extra parameters before ';base64,' (e.g., data:image/png;name=foo;param=bar;base64,...)
DATA_URL_RE = re.compile(
  r"^data:(?P<mime>[\w/+.\-]+)(?:;[\w.\-=+]+)*;base64,(?P<b64>.+)$",
  re.IGNORECASE
)

def parse_data_url(data_url: str) -> Tuple[bytes, str]:
  m = DATA_URL_RE.match((data_url or "").strip())
  if not m:
    raise HTTPException(status_code=400, detail="Invalid data URL")
  b64 = m.group("b64")
  mime = m.group("mime").lower()
  try:
    raw = base64.b64decode(b64, validate=True)
  except Exception:
    raise HTTPException(status_code=400, detail="Base64 decode failed")
  if len(raw) > MAX_DOWNLOAD_BYTES:
    raise HTTPException(status_code=413, detail="Payload too large")
  return raw, mime

def sha256_bytes(b: bytes) -> str:
  return hashlib.sha256(b).hexdigest()

def load_image_from_bytes(b: bytes) -> Image.Image:
  try:
    im = Image.open(io.BytesIO(b))
    im = im.convert("RGB")  # force decode + normalize to RGB
    return im
  except Exception:
    raise HTTPException(status_code=400, detail="Unsupported image")

def guarded_download(url: str) -> bytes:
  try:
    with requests.get(url, stream=True, timeout=MAX_DOWNLOAD_TIMEOUT) as r:
      r.raise_for_status()
      total = 0
      chunks: List[bytes] = []
      for chunk in r.iter_content(chunk_size=8192):
        if chunk:
          total += len(chunk)
          if total > MAX_DOWNLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Remote file too large")
          chunks.append(chunk)
      return b"".join(chunks)
  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=502, detail=f"Download failed: {e}")

def group_lines_into_paragraphs(lines, y_threshold=15) -> List[str]:
  """Group OCR lines into paragraphs based on vertical spacing. Works with easyocr results."""
  if not lines:
    return []
  lines_sorted = sorted(lines, key=lambda l: l[0][0][1])  # sort by y
  paragraphs: List[str] = []
  current_para: List[str] = []
  last_y: Optional[float] = None
  for (bbox, text, prob) in lines_sorted:
    y = bbox[0][1]
    if last_y is not None and abs(y - last_y) > y_threshold:
      if current_para:
        paragraphs.append(" ".join(current_para))
        current_para = []
    current_para.append(text)
    last_y = y
  if current_para:
    paragraphs.append(" ".join(current_para))
  return paragraphs

# -------------------------------------------------------------
# Detection stubs (replace with your real model calls)
# -------------------------------------------------------------
def detect_image_stub(img: Image.Image) -> Risk:
  """
  Replace this stub with your deepfake / spoof / faceforensics detector.
  For demonstration, compute a trivial score from high-frequency energy.
  """
  try:
    arr = np.asarray(img, dtype=np.float32) / 255.0
    gy, gx = np.gradient(arr.mean(axis=2))
    hf = float((np.abs(gx) + np.abs(gy)).mean())
    score = max(0.0, min(1.0, hf * 2.0))  # squashed to [0..1]
  except Exception:
    score = 0.0

  if score >= 0.75:
    level = "HIGH";   reasons = ["High-frequency artifacts detected"]
  elif score >= 0.45:
    level = "MEDIUM"; reasons = ["Moderate texture artifacts"]
  elif score >= 0.20:
    level = "LOW";    reasons = ["Low artifact evidence"]
  else:
    level = "SAFE";   reasons = ["No significant artifact evidence"]

  return Risk(level=level, score=score, reasons=reasons)

def aggregate_video_results(frames: List[FrameResult]) -> Risk:
  if not frames:
    return Risk(level="UNKNOWN", score=0.0, reasons=["No frames evaluated"])
  scores = [f.risk.score for f in frames]
  max_score = float(np.max(scores))
  mean_score = float(np.mean(scores))
  # Conservative: use max
  score = max_score
  if score >= 0.75:
    level = "HIGH"
  elif score >= 0.45:
    level = "MEDIUM"
  elif score >= 0.20:
    level = "LOW"
  else:
    level = "SAFE"
  reasons = [f"frames={len(frames)}", f"max={max_score:.2f}", f"mean={mean_score:.2f}"]
  return Risk(level=level, score=score, reasons=reasons)

# -------------------------------------------------------------
# Routes: Health
# -------------------------------------------------------------
@app.get("/healthz")
def health():
  return {
    "status": "ok",
    "opencv": HAS_CV2,
    "easyocr": HAS_EASYOCR,
    "limits": {
      "max_download_bytes": MAX_DOWNLOAD_BYTES,
      "max_download_timeout": MAX_DOWNLOAD_TIMEOUT,
      "video_max_frames": VIDEO_MAX_FRAMES,
      "video_fps_sample": VIDEO_FPS_SAMPLE,
    }
  }

# -------------------------------------------------------------
# Routes: Image Detection
# -------------------------------------------------------------
@app.post("/api/detect/image", response_model=ImageDetectResponse)
async def detect_image(file: UploadFile = File(...)):
  data = await file.read()
  if len(data) > MAX_DOWNLOAD_BYTES:
    raise HTTPException(status_code=413, detail="File too large")
  img = load_image_from_bytes(data)
  risk = detect_image_stub(img)
  return ImageDetectResponse(
    media_type="image",
    width=img.width,
    height=img.height,
    sha256=sha256_bytes(data),
    risk=risk,
  )

@app.post("/api/detect/image-dataurl", response_model=ImageDetectResponse)
async def detect_image_dataurl(payload: DataURLPayload = Body(...)):
  raw, _mime = parse_data_url(payload.data_url)
  img = load_image_from_bytes(raw)
  risk = detect_image_stub(img)
  return ImageDetectResponse(
    media_type="image",
    width=img.width,
    height=img.height,
    sha256=sha256_bytes(raw),
    risk=risk,
  )

@app.get("/api/detect/image-url", response_model=ImageDetectResponse)
def detect_image_url(url: str = Query(..., description="Direct image URL")):
  raw = guarded_download(url)
  img = load_image_from_bytes(raw)
  risk = detect_image_stub(img)
  return ImageDetectResponse(
    media_type="image",
    width=img.width,
    height=img.height,
    sha256=sha256_bytes(raw),
    risk=risk,
  )

# -------------------------------------------------------------
# Routes: Video Detection
# -------------------------------------------------------------
@app.post("/api/detect/video", response_model=VideoDetectResponse)
async def detect_video(
  file: UploadFile = File(...),
  max_frames: int = Query(VIDEO_MAX_FRAMES, ge=1, le=128),
  sample_fps: float = Query(VIDEO_FPS_SAMPLE, gt=0.0, le=30.0),
):
  if not HAS_CV2:
    raise HTTPException(status_code=501, detail="OpenCV not available on server")

  data = await file.read()
  if len(data) > MAX_DOWNLOAD_BYTES:
    raise HTTPException(status_code=413, detail="File too large")

  with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as tmp:
    tmp.write(data)
    tmp.flush()
    return _detect_video_path(tmp.name, max_frames=max_frames, sample_fps=sample_fps)

@app.get("/api/detect/video-url", response_model=VideoDetectResponse)
def detect_video_url(
  url: str = Query(...),
  max_frames: int = Query(VIDEO_MAX_FRAMES, ge=1, le=128),
  sample_fps: float = Query(VIDEO_FPS_SAMPLE, gt=0.0, le=30.0),
):
  if not HAS_CV2:
    raise HTTPException(status_code=501, detail="OpenCV not available on server")

  raw = guarded_download(url)
  with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as tmp:
    tmp.write(raw)
    tmp.flush()
    return _detect_video_path(tmp.name, max_frames=max_frames, sample_fps=sample_fps)

def _detect_video_path(path: str, max_frames: int, sample_fps: float) -> VideoDetectResponse:
  # HAS_CV2 checked by callers
  cap = cv2.VideoCapture(path)  # type: ignore[name-defined]
  if not cap.isOpened():
    raise HTTPException(status_code=400, detail="Could not open video")

  src_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
  total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
  step = max(int(round(src_fps / sample_fps)), 1)

  frames: List[FrameResult] = []
  idx = 0
  extracted = 0
  while extracted < max_frames:
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, frame = cap.read()
    if not ok:
      break

    # BGR -> RGB
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # type: ignore[name-defined]
    img = Image.fromarray(frame_rgb)
    risk = detect_image_stub(img)
    t = idx / (src_fps if src_fps else 25.0)

    frames.append(
      FrameResult(index=idx, time_sec=float(t), width=img.width, height=img.height, risk=risk)
    )

    extracted += 1
    idx += step
    if idx >= total and total > 0:
      break

  cap.release()

  agg = aggregate_video_results(frames)
  return VideoDetectResponse(
    media_type="video",
    frames_evaluated=len(frames),
    frame_results=frames,
    aggregate=agg,
  )

# -------------------------------------------------------------
# Routes: OCR (optional)
# -------------------------------------------------------------
@app.post("/api/ocr", response_model=OCRResponse)
async def ocr_endpoint(file: UploadFile = File(...)):
  """
  Upload an image and get OCR text grouped into paragraphs.
  """
  if not HAS_EASYOCR:
    raise HTTPException(status_code=501, detail="easyocr not installed on server")

  image_bytes = await file.read()
  if len(image_bytes) > MAX_DOWNLOAD_BYTES:
    raise HTTPException(status_code=413, detail="File too large")

  image = load_image_from_bytes(image_bytes)

  # Lazy-init reader so container can start even without model files downloaded
  global _easy_reader
  if _easy_reader is None:
    _easy_reader = easyocr.Reader(["en"])  # type: ignore

  results = _easy_reader.readtext(np.asarray(image))  # type: ignore
  paragraphs = group_lines_into_paragraphs(results)
  return OCRResponse(paragraphs=paragraphs)
