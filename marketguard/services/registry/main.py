from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import csv, os
from difflib import get_close_matches

app = FastAPI(title="SEBI-Shield Registry Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_PATH = os.environ.get("REGISTRY_CSV", "/data/registry_sample.csv")
records = []
with open(DATA_PATH, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    records = list(reader)

def search(q: str, t: str | None = None):
    # naive fuzzy: get top name matches; filter by type if given
    names = [r["name"] for r in records if (t is None or r["type"] == t)]
    hits = get_close_matches(q, names, n=5, cutoff=0.6)
    res = [r for r in records if r["name"] in hits and (t is None or r["type"] == t)]
    return res

@app.get("/api/registry/v1/verify")
def verify(nameOrHandle: str = Query(..., min_length=2), type: str | None = Query(None)):
    matches = search(nameOrHandle.strip(), type)
    return {"query": nameOrHandle, "matches": matches}