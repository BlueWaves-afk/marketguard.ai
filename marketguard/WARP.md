# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Architecture Overview

MarketGuard is a financial fraud detection system consisting of:

### Core Components
1. **Browser Extension** (`apps/extension/`): Chrome Manifest V3 extension that highlights risky text, detects UPI handles, and provides advisor verification on web pages
2. **Microservices** (`services/`): Three FastAPI services running on different ports
   - **Registry Service** (port 8001): SEBI advisor verification using SQLite database
   - **NLP Service** (port 8002): Risk analysis using DistilBERT + rule-based scoring
   - **Deepfake Service** (port 8003): Image/video analysis for detecting manipulated media

### Key Architecture Patterns
- **Containerized microservices**: Each service runs in its own Docker container with Python 3.11
- **Browser-extension integration**: Extension communicates with localhost APIs via CORS
- **Hybrid ML approach**: Combines transformer models (DistilBERT, Qwen) with regex rule engines
- **Modular content scripts**: Extension uses 8+ ordered JavaScript modules for different features
- **SQLite data layer**: Registry service uses SQLite with WAL mode for advisor verification

## Common Development Commands

### Running the Full Stack
```bash
# Start all services
docker compose up --build

# Start services in background
docker compose up --build -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

### Individual Service Development
```bash
# Registry service (port 8001)
cd services/registry
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 --reload

# NLP service (port 8002)
cd services/nlp
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8002 --reload

# Deepfake service (port 8003)
cd services/deepfake
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8003 --reload
```

### Extension Development
```bash
# Load extension in Chrome
# 1. Open chrome://extensions
# 2. Enable Developer mode
# 3. Click "Load unpacked" and select apps/extension/

# Test extension functionality
# - Select text on any webpage
# - Click "Verify Advisor" in floating card
# - Test UPI verification with "demo@valid"
```

### Service Health Checks
```bash
# Check all services are running
curl http://localhost:8001/healthz
curl http://localhost:8002/healthz
curl http://localhost:8003/healthz
```

### API Testing Examples
```bash
# Registry verification
curl "http://localhost:8001/api/registry/v1/verify?name=John%20Smith"

# NLP risk scoring
curl -X POST http://localhost:8002/api/nlp/v1/score \
  -H "Content-Type: application/json" \
  -d '{"text": "guaranteed 1000x returns, no risk!"}'

# Image analysis
curl -X POST http://localhost:8003/api/detect/image \
  -F "file=@image.jpg"
```

## Development Context

### Technology Stack
- **Backend**: FastAPI with Python 3.11, SQLite, Docker
- **ML/AI**: transformers (DistilBERT, Qwen), torch, PIL, OpenCV, EasyOCR
- **Frontend**: Chrome Extension (Manifest V3), Vanilla JavaScript
- **Data**: SQLite with generated SEBI advisor data, regex rule files

### Service API Patterns
- All services use FastAPI with CORS middleware enabled
- Health endpoints at `/healthz`
- API endpoints follow REST conventions under `/api/{service}/v1/`
- Services handle file uploads, data URLs, and external URL processing
- Error handling with appropriate HTTP status codes

### Extension Architecture
Content scripts are loaded in specific order:
1. `00-constants.js` - Configuration
2. `01-storage.js` - Browser storage utilities  
3. `02-helpers.js` - Utility functions
4. `03-highlight.js` - Text highlighting logic
5. `04-fab.js` - Floating action button
6. `05a-f-overlay-*.js` - Modal/popup components
7. `06-main.js` - Main initialization

### Data Management
- Registry data stored in SQLite (`sebi_dummy.db`)
- Regex rules in `scripts/regex_rules.json`
- Extension communicates with localhost:8001-8003 APIs
- Sample CSV data in `data/registry_sample.csv`

### Environment Configuration
Services use environment variables:
- `SEBI_DB`: SQLite database path
- `GEN_MODEL`, `GEN_MAX_NEW_TOKENS`: Generative AI settings
- `MAX_DOWNLOAD_BYTES`, `MAX_DOWNLOAD_TIMEOUT`: File handling limits
- `TOKENIZERS_PARALLELISM=false`: Prevents HuggingFace threading issues