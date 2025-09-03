from fastapi import FastAPI
from pydantic import BaseModel
from transformers import pipeline
import re

# Load lightweight classifier
classifier = pipeline("text-classification", model="distilbert-base-uncased-finetuned-sst-2-english")

app = FastAPI()

# Weighted scam patterns with human explanations
SCAM_KEYWORDS = {
    r"\bguaranteed\b": (0.7, "Claims of guaranteed profits (no investment is risk-free)."),
    r"\bno\s*risk\b": (0.6, "False claim of no risk."),
    r"\b1000x\b": (1.0, "Unrealistic promise of 1000x returns (impossible in real investments)."),
    r"\b\d+x\s*returns?\b": (0.9, "Exaggerated return claim (e.g. 50x, 100x)."),
    r"\bdouble\s*money\b": (0.8, "Suspicious promise of doubling money quickly."),
    r"\brisk[-\s]*free\b": (0.7, "Misleading claim of risk-free profits."),
    r"\bquick\s*profits?\b": (0.8, "Promise of quick profits, a common scam tactic."),
    r"\bget\s*richer?\s*fast\b": (1.0, "Classic 'get rich quick' scheme."),
}

class ScamInput(BaseModel):
    input: str

@app.post("/predict")
def predict(data: ScamInput):
    text = data.input

    # Step 1 - ML model score
    model_output = classifier(text)[0]
    model_label = model_output['label']
    model_score = model_output['score']

    # Step 2 - Rule-based weighted score + explanations
    signals = []
    weighted_score = 0
    total_weight = 0

    for pattern, (weight, reason) in SCAM_KEYWORDS.items():
        if re.search(pattern, text, re.IGNORECASE):
            signals.append(reason)
            weighted_score += weight
            total_weight += 1

    rule_score = (weighted_score / total_weight) if total_weight > 0 else 0

    # Step 3 - Combine scores
    scam_probability = 0.4 * model_score + 0.6 * rule_score

    # Step 4 - Risk category
    if scam_probability >= 0.75:
        risk_category = "Very High Risk"
    elif scam_probability >= 0.5:
        risk_category = "High Risk"
    elif scam_probability >= 0.3:
        risk_category = "Medium Risk"
    else:
        risk_category = "Low Risk"

    # Step 5 - Build clear explanation
    if signals:
        explanation = "This message shows multiple scam signals: " + " ".join(signals)
    else:
        explanation = "No obvious scam signals detected. Message seems safe, but caution is advised."

    return {
        "input": text,
        "model_label": model_label,
        "model_score": round(model_score, 3),
        "rule_score": round(rule_score, 3),
        "scam_probability": round(scam_probability, 3),
        "risk_category": risk_category,
        "signals": signals,
        "explanation": explanation
    }
