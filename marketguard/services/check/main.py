from fastapi import FastAPI, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import easyocr
import os
from datetime import datetime

app = FastAPI(title="Fraud Detector API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Init OCR
reader = easyocr.Reader(['en'])
os.makedirs("transcripts", exist_ok=True)

class TextReq(BaseModel):
    text: str

@app.post("/api/ocr")
async def ocr_image(file: UploadFile):
    """Extract text from uploaded image"""
    contents = await file.read()
    img_path = "temp.png"
    with open(img_path, "wb") as f:
        f.write(contents)

    results = reader.readtext(img_path, detail=0)

    # Save transcript
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = f"transcripts/ocr_{timestamp}.txt"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write("\n".join(results))

    return {"text": results}


@app.post("/api/process-text")
async def process_text(req: TextReq):
    """Save raw text (from DOM) and return acknowledgment"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = f"transcripts/dom_{timestamp}.txt"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(req.text)

    return {"message": "Text received", "length": len(req.text)}
