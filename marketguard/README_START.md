# SEBI-Shield Starter

This is a minimal, no-build **starter** for your hackathon MVP:
- **Browser extension (MV3)** with a content script that highlights risky phrases, detects UPI handles, and lets you verify advisors using selected text.
- **Three FastAPI services**: `registry` (mocked CSV lookup), `nlp` (rule-based risk), `check` (demo UPI verify).

## Run services
```bash
docker compose up --build
```

## Load the extension
1. Open Chrome → `chrome://extensions` → Enable **Developer mode**.
2. Click **Load unpacked**, choose `apps/extension`.
3. Open any page with text; select a name and click **Verify Advisor** in the floating card.
4. Type or find a UPI handle like `demo@valid` → click **Verify UPI**.

## Where to extend next
- Replace `data/registry_sample.csv` with actual registry sync (or pilot dump).
- Move NLP to a small multilingual model (BERT-mini) + expand `scripts/regex_rules.json`.
- Replace `check` demo logic with **SEBI Check** deeplink when available.