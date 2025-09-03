# main.py
from __future__ import annotations

import re
from typing import Dict, List, Any, Tuple

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from transformers import pipeline

# -------------------------------------------------------------------
# App
# -------------------------------------------------------------------
app = FastAPI(title="SEBI-Shield NLP Service (batch, new-logic)", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------------
# New Engine Logic (your latest)
#  - DistilBERT SST-2 + weighted regex signals
#  - Combine: 0.4 * model_score + 0.6 * rule_score
#  - Buckets: LOW (<0.3), MEDIUM (>=0.3,<0.5), HIGH (>=0.5,<0.75), HIGH (>=0.75 -> "HIGH")
#    (To keep parity with extension expectations, we’ll output LOW/MEDIUM/HIGH.)
# -------------------------------------------------------------------
classifier = pipeline(
    "text-classification",
    model="distilbert-base-uncased-finetuned-sst-2-english"
)

SCAM_KEYWORDS: Dict[str, Tuple[float, str]] = {
    r"\bguaranteed\b": (0.7, "Claims of guaranteed profits (no investment is risk-free)."),
    r"\bno\s*risk\b": (0.6, "False claim of no risk."),
    r"\b1000x\b": (1.0, "Unrealistic promise of 1000x returns (impossible in real investments)."),
    r"\b\d+x\s*returns?\b": (0.9, "Exaggerated return claim (e.g. 50x, 100x)."),
    r"\bdouble\s*money\b": (0.8, "Suspicious promise of doubling money quickly."),
    r"\brisk[-\s]*free\b": (0.7, "Misleading claim of risk-free profits."),
    r"\bquick\s*profits?\b": (0.8, "Promise of quick profits, a common scam tactic."),
    r"\bget\s*richer?\s*fast\b": (1.0, "Classic 'get rich quick' scheme."),
}
_COMPILED_RULES: List[Tuple[re.Pattern, float, str, str]] = [
    (re.compile(pat, re.IGNORECASE), weight, reason, pat)
    for pat, (weight, reason) in SCAM_KEYWORDS.items()
]

MAX_TEXT_LEN_SINGLE = 12000
MAX_ITEMS = 1000

# -------------------------------------------------------------------
# Schemas
# -------------------------------------------------------------------
class Item(BaseModel):
    id: int = Field(..., description="Client-provided ID to align results")
    text: str
    metadata: Dict[str, Any] | None = None

class BatchReq(BaseModel):
    lang: str = "en"
    items: List[Item] = Field(..., max_items=MAX_ITEMS)

class BatchResItem(BaseModel):
    id: int
    score: float
    risk: str
    highlights: List[Dict[str, Any]]  # [{span, tag, reason}]

class BatchRes(BaseModel):
    results: List[BatchResItem]

# -------------------------------------------------------------------
# Scoring (new logic)
# -------------------------------------------------------------------
def _rule_score(text: str) -> Tuple[float, List[Dict[str, Any]], List[str]]:
    """
    Returns (rule_score, highlights, signals)
      - rule_score ∈ [0,1] as average of triggered weights
      - highlights: [{span, tag, reason}]   (tag=pattern string for simplicity)
      - signals: human-readable reasons (unused by batch response but handy)
    """
    if not text:
        return 0.0, [], []
    text = text[:MAX_TEXT_LEN_SINGLE]

    total = 0.0
    denom = 0.0
    highlights: List[Dict[str, Any]] = []
    signals: List[str] = []

    for rgx, weight, reason, pat_str in _COMPILED_RULES:
        if rgx.search(text):
            total += weight
            denom += 1.0
            signals.append(reason)
            highlights.append({"span": rgx.pattern, "tag": pat_str, "reason": reason})

    return (total / denom if denom > 0 else 0.0), highlights, signals


def _model_score(text: str) -> float:
    if not text:
        return 0.0
    out = classifier(text[:MAX_TEXT_LEN_SINGLE])[0]
    # out: {'label': 'POSITIVE'|'NEGATIVE', 'score': float}
    # We just use the probability as-is (same as your new engine).
    return float(out.get("score", 0.0))


def _combine(model_s: float, rule_s: float) -> float:
    return 0.4 * model_s + 0.6 * rule_s


def _bucket(p: float) -> str:
    # Map to LOW / MEDIUM / HIGH for the extension
    if p >= 0.75:
        return "HIGH"
    if p >= 0.5:
        return "MEDIUM"
    return "LOW"


def _score_text(text: str) -> Tuple[str, float, List[Dict[str, Any]]]:
    """
    Full new-logic scoring for one text.
    Returns (risk_label, combined_score_rounded, highlights).
    """
    r_score, highlights, _signals = _rule_score(text)
    m_score = _model_score(text)
    p = _combine(m_score, r_score)
    return _bucket(p), round(float(p), 3), highlights

# -------------------------------------------------------------------
# Health
# -------------------------------------------------------------------
@app.get("/healthz")
def healthz():
    return {
        "ok": True,
        "rules_loaded": len(_COMPILED_RULES),
        "model": "distilbert-base-uncased-finetuned-sst-2-english"
    }

# -------------------------------------------------------------------
# Preferred batch endpoint
# -------------------------------------------------------------------
@app.post("/api/nlp/v1/batch-score", response_model=BatchRes)
def batch_score(req: BatchReq):
    items = req.items[:MAX_ITEMS]
    results: List[BatchResItem] = []

    for it in items:
        risk, score, highlights = _score_text(it.text or "")
        results.append(BatchResItem(
            id=it.id,
            score=score,
            risk=risk,
            highlights=highlights
        ))

    return BatchRes(results=results)

# -------------------------------------------------------------------
# Backward-compatible endpoint
#  - If body has {"items":[...]}, return { "results": [...] }
#  - Else expect {"text": "..."} and return single-object result
# -------------------------------------------------------------------
@app.post("/api/nlp/v1/score")
async def score_compat(request: Request):
    data = await request.json()

    # Batch passthrough
    if isinstance(data, dict) and "items" in data:
        lang = data.get("lang", "en")
        raw_items = data.get("items", [])
        items: List[Item] = []
        for i, it in enumerate(raw_items[:MAX_ITEMS]):
            try:
                items.append(
                    Item(
                        id=int(it.get("id", i)),
                        text=str(it.get("text", ""))[:MAX_TEXT_LEN_SINGLE],
                        metadata=it.get("metadata"),
                    )
                )
            except Exception:
                continue
        batch = BatchReq(lang=lang, items=items)
        return batch_score(batch)

    # Single-text legacy shape (kept for compatibility)
    text = (data or {}).get("text", "") if isinstance(data, dict) else ""
    risk, score, highlights = _score_text(text or "")
    return {"risk": risk, "score": score, "highlights": highlights}
