from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import easyocr
from PIL import Image
import io

# -------------------------------------------------------
# App Initialization
# -------------------------------------------------------
app = FastAPI(title="OCR Paragraph API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------
# OCR Engine
# -------------------------------------------------------
reader = easyocr.Reader(['en'])  # English only


# -------------------------------------------------------
# Models
# -------------------------------------------------------
class OCRResponse(BaseModel):
    paragraphs: list[str]


# -------------------------------------------------------
# Utils
# -------------------------------------------------------
def group_lines_into_paragraphs(lines, y_threshold=15):
    """Group OCR lines into paragraphs based on vertical spacing."""
    lines_sorted = sorted(lines, key=lambda l: l[0][0][1])  # sort by y
    paragraphs, current_para, last_y = [], [], None

    for (bbox, text, prob) in lines_sorted:
        y = bbox[0][1]
        if last_y is not None and abs(y - last_y) > y_threshold:
            paragraphs.append(" ".join(current_para))
            current_para = []
        current_para.append(text)
        last_y = y

    if current_para:
        paragraphs.append(" ".join(current_para))

    return paragraphs


# -------------------------------------------------------
# Routes
# -------------------------------------------------------
@app.post("/api/ocr", response_model=OCRResponse)
async def ocr_endpoint(file: UploadFile = File(...)):
    """
    Upload an image and get OCR text grouped into paragraphs.
    """
    image_bytes = await file.read()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    results = reader.readtext(image)

    paragraphs = group_lines_into_paragraphs(results)

    return {"paragraphs": paragraphs}
