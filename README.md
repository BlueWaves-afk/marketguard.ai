# marketguard.ai

> **Verify. Detect. Educate — right where investors decide.**
> AI-powered browser extension & mobile SDK for real-time advisor verification, scam-language detection, and deepfake warnings — aligned with SEBI’s 2025 investor-protection push.

---

## Table of Contents

* [Problem](#problem)
* [Solution (Three Protective Rails)](#solution-three-protective-rails)
* [Why Now](#why-now)
* [How It Aligns with SEBI Objectives](#how-it-aligns-with-sebi-objectives)
* [Architecture](#architecture)
* [Repo Structure](#repo-structure)
* [Getting Started](#getting-started)
* [APIs (Draft)](#apis-draft)
* [Risk Scoring & Features](#risk-scoring--features)
* [KPIs & Success Criteria (Pilot)](#kpis--success-criteria-pilot)
* [Roadmap](#roadmap)
* [Security & Privacy](#security--privacy)
* [What We Need (for pilots)](#what-we-need-for-pilots)
* [Problem-Statement Fit](#problem-statement-fit)
* [Contributing](#contributing)
* [License](#license)
* [Disclaimer](#disclaimer)

---

## Problem

* **Impersonation of IAs/RAs** (SEBI-registered investment advisors & research analysts).
* **Misleading claims** (“guaranteed returns”, “insider access”, “anchor block at discount”).
* **Deepfakes & forged assets** (fake letterheads/logos, manipulated videos).
* **Manual verification friction** (registry checks, UPI validation) → users often skip due diligence.

---

## Solution (Three Protective Rails)

1. **Advisor / Intermediary Verification**

   * One-click **IA/RA registry** lookup → “✅ Verified” / “❌ Not Found” + license details.
   * **SEBI Check + @valid UPI** deeplink before payment (scan QR / parse UPI).

2. **Content Risk Analyzer (NLP)**

   * On-page text/transcript analysis → **Low / Medium / High** risk.
   * Highlights risky phrases and maps them to IA/RA Advertisement Code concepts (no “assured returns”, required disclosures).

3. **Deepfake / Forgery Cues**

   * Lightweight heuristics for **video/image artifacts** (lip-sync jitter, frame flicker, logo OCR mismatches).
   * “**Likely synthetic**” banner (no absolute claims) + education links.

**One-tap actions:** Report via **SCORES**; open official advisor page; open **SEBI Check**.

---

## Why Now

* **Retail at scale:** \~**19–20 crore** demat accounts (2025).
* **Digital exposure:** \~**490M** social-media users; finance discovery is social/video-first.
* **Scams rising:** #SEBIvsSCAM campaign highlights fake tips/apps, unregistered advice, deepfakes.
* **New vector:** “**Fake FPI access**” claims on social/WhatsApp.
  **Conclusion:** Protection must be **in-context** (YouTube, X, Telegram, WhatsApp, browsers), not after the fact.

---

## How It Aligns with SEBI Objectives

* **Enhances retail education & engagement:** in-flow explainers and verified lookups.
* **Fraud prevention:** flags impersonation, scam-language, payment misdirection.
* **Member compliance support:** ad-code nudges for advisors/creators; pre-publish linting.
* **Operationalizes** **SEBI Check** & **@valid UPI** inside actual user flows.
* Amplifies **#SEBIvsSCAM** with contextual cues linking to official guidance.

---

## Architecture

**Client**

* Browser Extension (Chrome/Firefox)
* Mobile SDK overlay (Android/iOS) for partner apps

**Services**

* **Registry Service:** IA/RA + intermediaries (periodic sync/cache)
* **SEBI Check Bridge:** UPI/QR → verified handle/bank (deeplink to official flow)
* **NLP Service:** BERT-small + rulepack for scam patterns (on-device first, optional cloud assist)
* **Deepfake Heuristics:** frame-diff, facial-landmark jitter, logo OCR

**Privacy by Design**

* On-device analysis by default; opt-in for server calls; hashed telemetry.

```
client (extension / mobile SDK)
    ├─ advisor-verify widget ───┐
    ├─ content-risk overlay ────┼──> services (API gateway)
    └─ deepfake cue modal ──────┘       ├─ registry
                                        ├─ nlp
                                        ├─ deepfake
                                        └─ sebi-check bridge
```

---

## Repo Structure

```
marketguard/
├─ apps/
│  ├─ extension/          # Chrome/Firefox extension (React/TS)
│  └─ mobile-sdk/         # Android/iOS SDK overlay (Kotlin/Swift)
├─ services/
│  ├─ registry/           # IA/RA lookup + cache
│  ├─ nlp/                # risk scoring API (BERT-small + rules)
│  ├─ deepfake/           # basic media checks (images/video)
│  └─ sebi-check-bridge/  # deeplink helpers for UPI/QR verification
├─ packages/
│  ├─ ui/                 # shared UI components
│  └─ core/               # common models/types/utils
├─ datasets/              # seed corpora, regex packs, test media (synthetic)
├─ docs/                  # architecture, API docs, threat model
├─ scripts/               # setup, lint, build
└─ docker/                # docker-compose for services
```

---

## Getting Started

### Prerequisites

* Node.js 18+, pnpm or npm
* Python 3.10+ (for services)
* (Optional) Docker Desktop for local services

### Quick Start (dev)

```bash
# 1) clone
git clone https://github.com/<org>/marketguard.git
cd sebi-shield

# 2) install root deps
pnpm install  # or npm install

# 3) spin up services (registry, nlp, deepfake, bridge)
docker compose -f docker/compose.dev.yml up --build

# 4) run extension
cd apps/extension
pnpm dev   # builds and serves extension (see console for load instructions)

# 5) run mobile SDK example app (optional)
cd ../../apps/mobile-sdk
# follow README in that folder for Android/iOS demo app
```

### Environment Variables (example)

Create `.env` files under each service:

```
REGISTRY_REFRESH_CRON=0 */6 * * *
SEBI_CHECK_DEEPLINK_BASE=https://<official-or-sandbox-endpoint>
TELEMETRY_MODE=HASHED
NLP_MODEL=bert-mini-hi-en
DEEPFAKE_HEURISTICS=on
```

---

## APIs (Draft)

### 1) Advisor / Intermediary Verification

`GET /api/registry/v1/verify?nameOrHandle=<q>&type=IA|RA|OTHER`

```json
{
  "query": "Rahul Sharma",
  "matches": [
    { "name": "Rahul Sharma", "type": "IA", "reg_no": "INA0000XXXX",
      "status": "Active", "member": "XYZ Pvt Ltd", "link": "https://..." }
  ]
}
```

### 2) Content Risk Analyzer

`POST /api/nlp/v1/score`

```json
{
  "lang": "en",
  "text": "Guaranteed 10x returns, insider access to FPI route...",
  "metadata": { "source": "webpage", "url": "https://..." }
}
```

**Response**

```json
{
  "risk": "HIGH",
  "score": 0.87,
  "highlights": [
    { "span": "Guaranteed 10x returns", "tag": "AssuredReturnClaim" },
    { "span": "insider access to FPI route", "tag": "FakeFPIAccess" }
  ],
  "rules": ["AdCode.NoAssuredReturns", "AdCode.RequiredDisclosures"]
}
```

### 3) Deepfake / Forgery Check

`POST /api/media/v1/check`

* Accepts image/video; returns `{ likelihood: "LOW|MEDIUM|HIGH", reasons: [...] }`

### 4) SEBI Check Deeplink Helper

`POST /api/check/v1/upi-verify`

```json
{ "upi": "name@valid" }
```

**Response**

```json
{ "deeplink": "sebi-check://verify?upi=name@valid", "display": "Verified handle • HDFC Bank" }
```

---

## Risk Scoring & Features

**NLP features (examples)**

* Phrase/regex: `assured|guaranteed returns|multibagger`, `insider`, `FPI access`, `DM me`, `limited window`, `send UPI`
* Contextual rules: missing disclaimers, no risk statement, misuse of “research report” terms
* Model: BERT-small (EN/HI) + rules → calibrated **Low/Medium/High**

**Deepfake cues (heuristics)**

* Lip-audio jitter, frame flicker, eye-blink anomalies
* Logo/letterhead OCR mismatch vs. known templates

**Advisor verification**

* Fuzzy match names/handles → disambiguation UI → link to official entry
* **@valid UPI** visual cue + **SEBI Check** deeplink prior to payment

---

## KPIs & Success Criteria (Pilot)

* **Time-to-verify advisor/UPI:** **≤5s** overlay (baseline 90–120s) → **\~95% faster**
* **Risky clicks/UPI attempts:** **−40–60%** (A/B)
* **Advisor match precision:** **≥90%** (exact-match with disambiguation)
* **Scam-NLP precision (High):** **≥80%** (EN/HI held-out)
* **Deepfake recall (basic):** **≥60%** on curated clips (communicate “likely/uncertain”)
* **SCORES uplift:** **+25–35%** serious-case reporting via one-tap deeplink

---

## Roadmap

* **M0–M1:** MVP — registry cache, NLP high-risk pack, UPI deeplink, Chrome demo
* **M2–M3:** Image deepfake heuristics, multilingual packs, broker sandbox
* **M4–M6:** Video heuristics v2, iOS/Android SDK, A/B with 1 broker + 1 video platform
* **Year 2:** Commercial SDK; enterprise dashboards; extended regulator integrations

---

## Security & Privacy

* **On-device first**; server assist only with explicit consent
* **No face recognition**; only artifact cues; conservative language (“likely”, not definitive)
* **PII minimization**; hashed telemetry; audit logs; model kill-switch thresholds
* **Human-in-the-loop** model review; bias & drift tests

---

## What We Need (for pilots)

* **From SEBI:** registry feed/API or periodic dumps; **SEBI Check** deeplink/branding; #SEBIvsSCAM content hooks; sandbox pairing
* **From Brokers/Platforms:** distribution (test cohort), A/B cell, anonymized metrics

**Value to partners**

* **Fraud disputes/refunds:** **−30–50%**
* **Support tickets:** **−20–30%** (verification/how-to)
* **Compliance lift:** pre-publish Ad-Code linting for creators/advisors

---

## Problem-Statement Fit

* **Primary:** **(2) Enhancing Retail Investor Education & Engagement**
* **Secondary:** **(1) Fraud Prevention**
* **Supportive:** **(4) Member Compliance Monitoring**
  *(Not targeted: (3) Bond Liquidity)*

---

## Contributing

PRs welcome! Please:

1. Open an issue describing the change.
2. Add tests for new logic.
3. Run `pnpm lint && pnpm test` (or `npm run ...`).
4. Ensure no sensitive data is committed.

---

## License

MIT (proposed). See [LICENSE](LICENSE).

---

## Disclaimer

SEBI-Shield provides **educational and verification assistance**. It does **not** provide investment advice. Always consult official SEBI resources and registered intermediaries for final decisions.

---

> Need a **starter `README.pptx` one-pager**, demo data, or a **Docker compose** tailored to your cloud? I can add those sections inline to this README in your preferred style.
