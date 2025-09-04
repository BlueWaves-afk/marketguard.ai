# main.py
from __future__ import annotations

import os
# Disable HF tokenizers internal threading (prevents "Already borrowed")
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import re
import threading
from typing import Dict, List, Any, Tuple

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from transformers import pipeline

# ------------------------------------------------------------------------------
# App
# ------------------------------------------------------------------------------
app = FastAPI(title="marketguard.ai nlp service", version="2.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten for prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------------------
# Classifier (rules + sentiment model)
# ------------------------------------------------------------------------------
classifier = pipeline(
    "text-classification",
    model="distilbert-base-uncased-finetuned-sst-2-english"
)
tokenizer = classifier.tokenizer

# Serialize access to HF pipeline/tokenizer to avoid "Already borrowed" errors
_HF_LOCK = threading.Lock()

# Robustly determine max positions
_cfg_max = getattr(getattr(classifier, "model", None), "config", None)
_model_max = getattr(_cfg_max, "max_position_embeddings", 512) if _cfg_max else 512
_tok_max = getattr(tokenizer, "model_max_length", 512)
if isinstance(_tok_max, int) and 0 < _tok_max < 1_000_000:
    max_len = min(_model_max, _tok_max)
else:
    max_len = _model_max or 512
max_len = int(max(16, min(512, max_len)))  # safety clamp

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

# ------------------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------------------
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

# ------------------------------------------------------------------------------
# Scoring (hybrid: rules + model) with robust long-text handling
# ------------------------------------------------------------------------------
def _rule_score(text: str) -> Tuple[float, List[Dict[str, Any]], List[str]]:
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


def _normalize_overflow_windows(enc) -> List[List[int]]:
    """
    Normalize tokenizer output into a list of input_id windows.
    Works for:
      - dict-like BatchEncoding: enc["input_ids"] -> List[List[int]]
      - fast tokenizers returning .encodings -> List[Encoding] with .ids
      - rare cases where enc behaves like a list of encodings
    """
    # Case 1: BatchEncoding/dict
    try:
        if hasattr(enc, "keys") and "input_ids" in enc:
            windows = enc["input_ids"]
            if isinstance(windows, list) and windows and isinstance(windows[0], list):
                return windows
    except Exception:
        pass

    # Case 2: fast tokenizers – .encodings is a list[Encoding]
    try:
        if hasattr(enc, "encodings") and enc.encodings:
            return [e.ids for e in enc.encodings]
    except Exception:
        pass

    # Case 3: iterable of encodings
    try:
        if isinstance(enc, (list, tuple)) and enc and hasattr(enc[0], "ids"):
            return [e.ids for e in enc]
    except Exception:
        pass

    # Fallback: nothing usable
    return []


def _model_score(text: str) -> float:
    """
    DistilBERT SST-2 with safe handling of >512 token inputs using overflow-aware
    chunking (no 512 warnings or indexing errors).
    """
    if not text:
        return 0.0
    text = text[:MAX_TEXT_LEN_SINGLE]

    stride = max(1, int((max_len - 2) * 0.2))  # ~20% overlap
    # Use tokenizer overflow to split into windows of size max_len
    with _HF_LOCK:
        enc = tokenizer(
            text,
            truncation=True,
            max_length=max_len,
            return_overflowing_tokens=True,
            stride=stride,
            add_special_tokens=True,
            return_attention_mask=False,
            return_token_type_ids=False,
        )

    input_id_windows = _normalize_overflow_windows(enc)

    # If we somehow failed to get windows, fall back to a single truncated pass
    if not input_id_windows:
        with _HF_LOCK:
            out = classifier(text, truncation=True, max_length=max_len)[0]
        return float(out.get("score", 0.0))

    best = 0.0
    for ids in input_id_windows:
        # Decode each window to text and score
        with _HF_LOCK:
            chunk_text = tokenizer.decode(ids, skip_special_tokens=True)
            out = classifier(chunk_text, truncation=True, max_length=max_len)[0]
        s = float(out.get("score", 0.0))
        if s > best:
            best = s
    return best


def _combine(model_s: float, rule_s: float) -> float:
    return 0.4 * model_s + 0.6 * rule_s


def _bucket(p: float) -> str:
    if p >= 0.75:
        return "HIGH"
    if p >= 0.5:
        return "MEDIUM"
    return "LOW"


def _score_text(text: str) -> Tuple[str, float, List[Dict[str, Any]]]:
    r_score, highlights, _signals = _rule_score(text)
    m_score = _model_score(text)
    p = _combine(m_score, r_score)
    return _bucket(p), round(float(p), 3), highlights

def _score_with_highlights(text: str) -> Tuple[str, float, List[Dict[str, Any]], List[str]]:
    r_score, highlights, signals = _rule_score(text)
    m_score = _model_score(text)
    p = _combine(m_score, r_score)
    return _bucket(p), round(float(p), 3), highlights, signals

# ------------------------------------------------------------------------------
# Health
# ------------------------------------------------------------------------------
@app.get("/healthz")
def healthz():
    return {
        "ok": True,
        "rules_loaded": len(_COMPILED_RULES),
        "model": "distilbert-base-uncased-finetuned-sst-2-english",
        "max_len": max_len,
    }

# ------------------------------------------------------------------------------
# Batch scoring
# ------------------------------------------------------------------------------
@app.post("/api/nlp/v1/batch-score", response_model=BatchRes)
def batch_score(req: BatchReq):
    items = req.items[:MAX_ITEMS]
    results: List[BatchResItem] = []
    for it in items:
        risk, score, highlights = _score_text(it.text or "")
        results.append(BatchResItem(id=it.id, score=score, risk=risk, highlights=highlights))
    return BatchRes(results=results)

# ------------------------------------------------------------------------------
# Backward-compatible endpoint
# ------------------------------------------------------------------------------
@app.post("/api/nlp/v1/score")
async def score_compat(request: Request):
    data = await request.json()

    if isinstance(data, dict) and "items" in data:
        lang = data.get("lang", "en")
        raw_items = data.get("items", [])
        items: List[Item] = []
        for i, it in enumerate(raw_items[:MAX_ITEMS]):
            try:
                items.append(Item(
                    id=int(it.get("id", i)),
                    text=str(it.get("text", ""))[:MAX_TEXT_LEN_SINGLE],
                    metadata=it.get("metadata"),
                ))
            except Exception:
                continue
        batch = BatchReq(lang=lang, items=items)
        return batch_score(batch)

    text = (data or {}).get("text", "") if isinstance(data, dict) else ""
    risk, score, highlights = _score_text(text or "")
    return {"risk": risk, "score": score, "highlights": highlights}

# ========================= Generative Explanation =========================
GEN_MODEL = os.environ.get("GEN_MODEL", "Qwen/Qwen2.5-1.5B-Instruct")
GEN_MAX_NEW_TOKENS = int(os.environ.get("GEN_MAX_NEW_TOKENS", "180"))
GEN_TEMPERATURE = float(os.environ.get("GEN_TEMPERATURE", "0.35"))
GEN_TOP_P = float(os.environ.get("GEN_TOP_P", "0.9"))
GEN_ATTN_IMPL = os.environ.get("GEN_ATTN_IMPL", "eager")  # avoids flash-attn warnings
# Explicit device to avoid "accelerate" requirement: -1=CPU, 0=GPU
try:
    import torch
    _DEFAULT_DEVICE = 0 if torch.cuda.is_available() else -1
except Exception:
    _DEFAULT_DEVICE = -1
GEN_DEVICE = int(os.environ.get("GEN_DEVICE", str(_DEFAULT_DEVICE)))

_gen_pipe = None
_gen_tokenizer = None

def _ensure_generator():
    global _gen_pipe, _gen_tokenizer
    if _gen_pipe is not None:
        return
    try:
        _gen_pipe = pipeline(
            "text-generation",
            model=GEN_MODEL,
            tokenizer=GEN_MODEL,
            torch_dtype="auto",
            trust_remote_code=True,
            model_kwargs={"attn_implementation": GEN_ATTN_IMPL},
            device=GEN_DEVICE,   # <- no accelerate needed
        )
        _gen_tokenizer = _gen_pipe.tokenizer
    except Exception:
        _gen_pipe = None
        _gen_tokenizer = None

def _build_prompt(text: str, bullets: List[str], risk: str, score: float) -> str:
    bullets = [b.strip() for b in bullets if b and b.strip()]
    bullets_block = "\n".join(f"- {b}" for b in bullets[:6]) if bullets else "- (no explicit rule signals)"
    base = (
        "You are a financial safety expert.\n"
        "Explain clearly why the following message could be a scam or risky.\n"
        "Give practical guidance on what the user should do (verify, avoid payment/links, report).\n"
        f"Risk: {risk}  |  Score: {score:.2f}\n"
        f"Signals:\n{bullets_block}\n\n"
        "Message:\n\"\"\"\n" + text[:1200] + "\n\"\"\"\n\n"
        "Write 3–5 concise sentences. Avoid emojis and sensational language."
    )
    if _gen_tokenizer is not None and hasattr(_gen_tokenizer, "apply_chat_template"):
        messages = [
            {"role": "system", "content": "You are a helpful, cautious assistant specialized in investment fraud prevention."},
            {"role": "user", "content": base},
        ]
        try:
            return _gen_tokenizer.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )
        except Exception:
            return base
    return base

def _generate_explanation(text: str, bullets: List[str], risk: str, score: float) -> str:
    _ensure_generator()
    prompt = _build_prompt(text, bullets, risk, score)
    _gen_pipe=None #untill we find a small enough llm, or a cloud llm
    if _gen_pipe is None:
        print('pipe is none')
        if bullets:
            return (f"This text shows these scam signals: {'; '.join(bullets[:5])}. "
                    f"Overall risk is {risk.lower()} ({score:.2f}). Consider verifying the sender, "
                    f"avoiding payments/links, and reporting if suspicious.")
        return f"No explicit scam patterns matched, but overall risk is {risk.lower()} ({score:.2f}). Stay cautious."

    out = _gen_pipe(
        prompt,
        max_new_tokens=GEN_MAX_NEW_TOKENS,
        do_sample=True,
        temperature=GEN_TEMPERATURE,
        top_p=GEN_TOP_P,
        repetition_penalty=1.1,
        eos_token_id=getattr(_gen_tokenizer, "eos_token_id", None),
        pad_token_id=getattr(_gen_tokenizer, "pad_token_id", None),
    )
    text_out = ""
    try:
        text_out = out[0].get("generated_text", "")
        if isinstance(text_out, str) and len(text_out) > len(prompt):
            text_out = text_out[len(prompt):].strip()
    except Exception:
        pass
    if not text_out:
        if bullets:
            return f"This text shows these scam signals: {'; '.join(bullets[:5])}. Overall risk is {risk.lower()} ({score:.2f})."
        return f"Overall risk is {risk.lower()} ({score:.2f}). Be cautious."
    return text_out.strip()

class GenExplainReq(BaseModel):
    text: str
    highlights: List[Dict[str, Any]] | None = None

class GenExplainRes(BaseModel):
    risk: str
    score: float
    explanation: str
    bullets: List[str]
    highlights: List[Dict[str, Any]]

@app.post("/api/nlp/v1/generative-explanation", response_model=GenExplainRes)
async def generative_explanation(req: GenExplainReq):
    text = (req.text or "")[:MAX_TEXT_LEN_SINGLE]
    if not text.strip():
        raise HTTPException(status_code=400, detail="text is required")

    if req.highlights:
        risk, score, _hl2, signals = _score_with_highlights(text)
        hl = req.highlights
    else:
        risk, score, hl, signals = _score_with_highlights(text)

    bullets = signals[:] if signals else [h.get("reason", h.get("span", "")) for h in (hl or [])]
    bullets = [b for b in bullets if b][:8]

    explanation = _generate_explanation(text, bullets, risk, score)
    return GenExplainRes(
        risk=risk,
        score=score,
        explanation=explanation,
        bullets=bullets,
        highlights=hl or [],
    )
# ======================= /Generative Explanation =======================
