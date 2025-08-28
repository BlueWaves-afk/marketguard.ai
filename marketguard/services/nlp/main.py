from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json, os, re

app = FastAPI(title="SEBI-Shield NLP Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RULES_PATH = os.environ.get("RISK_RULES", "/scripts/regex_rules.json")
with open(RULES_PATH, "r", encoding="utf-8") as f:
    RULES = json.load(f)

class Req(BaseModel):
    lang: str = "en"
    text: str
    metadata: dict | None = None

@app.post("/api/nlp/v1/score")
def score(req: Req):
    text = req.text or ""
    hits = []
    for tag, phrases in RULES.items():
        for p in phrases:
            if re.search(r"\b" + re.escape(p) + r"\b", text, flags=re.IGNORECASE):
                hits.append({"span": p, "tag": tag})
    # naive scoring: high if >=2 tags or one severe tag
    tags = {h["tag"] for h in hits}
    if not hits:
        risk, s = "LOW", 0.1
    elif "AssuredReturnClaim" in tags or "FakeFPIAccess" in tags:
        risk, s = "HIGH", 0.85
    else:
        risk, s = "MEDIUM", 0.55
    return {"risk": risk, "score": s, "highlights": hits}