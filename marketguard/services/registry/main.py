# app.py
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Dict, Any
from difflib import get_close_matches
import os
import sqlite3

app = FastAPI(title="SEBI-Shield Registry Service (SQLite)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.environ.get("SEBI_DB", "./sebi_dummy.db")

# -------------- DB Utilities --------------

def get_conn() -> sqlite3.Connection:
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"SQLite DB not found at {DB_PATH}. Set SEBI_DB env var.")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn

def row_to_dict(r: sqlite3.Row) -> Dict[str, Any]:
    return {k: r[k] for k in r.keys()}

# -------------- Core Queries --------------

def fetch_by_reg_no(conn: sqlite3.Connection, reg_no: str, typ: Optional[str]) -> List[Dict[str, Any]]:
    reg_no = reg_no.strip().upper()
    q = """
        SELECT u.id, u.full_name, u.username, u.email, u.phone,
               u.intermediary_type, u.sebi_reg_no, u.pan_id, u.account_status,
               COALESCE(SUM(CASE WHEN m.id IS NOT NULL THEN 1 ELSE 0 END),0) AS mal_count,
               COALESCE(SUM(CASE WHEN m.resolved=0 THEN 1 ELSE 0 END),0) AS unresolved,
               upi.upi_id, upi.verification_status
        FROM users u
        LEFT JOIN malicious_activities m ON m.user_id = u.id
        LEFT JOIN upi_accounts upi ON upi.user_id = u.id
        WHERE u.sebi_reg_no = ?
        {typ_filter}
        GROUP BY u.id
        LIMIT 20
    """.format(typ_filter="AND u.intermediary_type = ?" if typ else "")
    cur = conn.execute(q, (reg_no,) if not typ else (reg_no, typ))
    return [row_to_dict(r) for r in cur.fetchall()]

def fetch_by_pan(conn: sqlite3.Connection, pan: str, typ: Optional[str]) -> List[Dict[str, Any]]:
    pan = pan.strip().upper()
    q = """
        SELECT u.id, u.full_name, u.username, u.email, u.phone,
               u.intermediary_type, u.sebi_reg_no, u.pan_id, u.account_status,
               COALESCE(SUM(CASE WHEN m.id IS NOT NULL THEN 1 ELSE 0 END),0) AS mal_count,
               COALESCE(SUM(CASE WHEN m.resolved=0 THEN 1 ELSE 0 END),0) AS unresolved,
               upi.upi_id, upi.verification_status
        FROM users u
        LEFT JOIN malicious_activities m ON m.user_id = u.id
        LEFT JOIN upi_accounts upi ON upi.user_id = u.id
        WHERE u.pan_id = ?
        {typ_filter}
        GROUP BY u.id
        LIMIT 20
    """.format(typ_filter="AND u.intermediary_type = ?" if typ else "")
    cur = conn.execute(q, (pan,) if not typ else (pan, typ))
    return [row_to_dict(r) for r in cur.fetchall()]

def fetch_by_upi(conn: sqlite3.Connection, upi: str, typ: Optional[str]) -> List[Dict[str, Any]]:
    upi = upi.strip().lower()
    q = """
        SELECT u.id, u.full_name, u.username, u.email, u.phone,
               u.intermediary_type, u.sebi_reg_no, u.pan_id, u.account_status,
               COALESCE(SUM(CASE WHEN m.id IS NOT NULL THEN 1 ELSE 0 END),0) AS mal_count,
               COALESCE(SUM(CASE WHEN m.resolved=0 THEN 1 ELSE 0 END),0) AS unresolved,
               upi.upi_id, upi.verification_status
        FROM users u
        JOIN upi_accounts upi ON upi.user_id = u.id
        LEFT JOIN malicious_activities m ON m.user_id = u.id
        WHERE lower(upi.upi_id) = ?
        {typ_filter}
        GROUP BY u.id
        LIMIT 20
    """.format(typ_filter="AND u.intermediary_type = ?" if typ else "")
    cur = conn.execute(q, (upi,) if not typ else (upi, typ))
    return [row_to_dict(r) for r in cur.fetchall()]

def fetch_by_name_exact(conn: sqlite3.Connection, name: str, typ: Optional[str]) -> List[Dict[str, Any]]:
    name = name.strip()
    q = """
        SELECT u.id, u.full_name, u.username, u.email, u.phone,
               u.intermediary_type, u.sebi_reg_no, u.pan_id, u.account_status,
               COALESCE(SUM(CASE WHEN m.id IS NOT NULL THEN 1 ELSE 0 END),0) AS mal_count,
               COALESCE(SUM(CASE WHEN m.resolved=0 THEN 1 ELSE 0 END),0) AS unresolved,
               upi.upi_id, upi.verification_status
        FROM users u
        LEFT JOIN malicious_activities m ON m.user_id = u.id
        LEFT JOIN upi_accounts upi ON upi.user_id = u.id
        WHERE u.full_name = ?
        {typ_filter}
        GROUP BY u.id
        LIMIT 20
    """.format(typ_filter="AND u.intermediary_type = ?" if typ else "")
    cur = conn.execute(q, (name,) if not typ else (name, typ))
    return [row_to_dict(r) for r in cur.fetchall()]

def fetch_by_name_fuzzy(conn: sqlite3.Connection, name: str, typ: Optional[str]) -> List[Dict[str, Any]]:
    # Get a candidate list of names (optionally filtered by type)
    name = name.strip()
    base_q = "SELECT id, full_name FROM users" + (" WHERE intermediary_type = ?" if typ else "")
    cur = conn.execute(base_q, (typ,)) if typ else conn.execute(base_q)
    rows = cur.fetchall()
    names = [r["full_name"] for r in rows]

    # Fuzzy match to top 8 names
    best = get_close_matches(name, names, n=8, cutoff=0.6)
    if not best:
        return []

    q = """
        SELECT u.id, u.full_name, u.username, u.email, u.phone,
               u.intermediary_type, u.sebi_reg_no, u.pan_id, u.account_status,
               COALESCE(SUM(CASE WHEN m.id IS NOT NULL THEN 1 ELSE 0 END),0) AS mal_count,
               COALESCE(SUM(CASE WHEN m.resolved=0 THEN 1 ELSE 0 END),0) AS unresolved,
               upi.upi_id, upi.verification_status
        FROM users u
        LEFT JOIN malicious_activities m ON m.user_id = u.id
        LEFT JOIN upi_accounts upi ON upi.user_id = u.id
        WHERE u.full_name IN ({placeholders})
        {typ_filter}
        GROUP BY u.id
        LIMIT 20
    """.format(
        placeholders=",".join(["?"] * len(best)),
        typ_filter="AND u.intermediary_type = ?" if typ else "",
    )

    params: List[Any] = list(best)
    if typ:
        params.append(typ)

    cur2 = conn.execute(q, params)
    return [row_to_dict(r) for r in cur2.fetchall()]

# -------------- Risk summarizer --------------

def summarize_risk(row: Dict[str, Any]) -> Dict[str, Any]:
    mal = int(row.get("mal_count") or 0)
    unres = int(row.get("unresolved") or 0)
    acct = row.get("account_status") or "active"
    ver = (row.get("verification_status") or "pending").lower()

    score = 0
    reasons: List[str] = []
    if mal > 0:
        score += mal * 10
        reasons.append(f"{mal} malicious activities")
    if unres > 0:
        score += unres * 15
        reasons.append(f"{unres} unresolved")
    if acct != "active":
        score += 25
        reasons.append(f"account {acct}")
    if ver != "verified":
        score += 20
        reasons.append(f"UPI {ver}")

    level = "SAFE"
    if score >= 70:
        level = "HIGH RISK"
    elif score >= 40:
        level = "MEDIUM RISK"
    elif score >= 20:
        level = "LOW RISK"

    return {"level": level, "score": score, "reasons": reasons}

# -------------- API Routes --------------

@app.get("/healthz")
def health():
    try:
        conn = get_conn()
        conn.execute("SELECT 1")
        conn.close()
        return {"status": "ok", "db": DB_PATH}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/registry/v1/verify")
def verify(
    reg_no: Optional[str] = Query(None, description="SEBI reg no e.g., INA00012345 / INH / INP / INZ"),
    pan: Optional[str] = Query(None, min_length=10, max_length=10, description="PAN-like ID"),
    upi: Optional[str] = Query(None, description="UPI ID e.g., lastname@ybl"),
    name: Optional[str] = Query(None, min_length=2, description="Full name"),
    type: Optional[str] = Query(None, regex="^(IA|RA|PMS|BROKER|NONE)$"),
    fuzzy: int = Query(0, ge=0, le=1, description="Set to 1 for fuzzy name match"),
):
    """
    Verify existence/validity of registry IDs against the generated SQLite DB.
    Provide **one** of: reg_no | pan | upi | name
    Optional filter: type in {IA,RA,PMS,BROKER,NONE}
    """
    if not any([reg_no, pan, upi, name]):
        raise HTTPException(status_code=400, detail="Provide one of: reg_no | pan | upi | name")

    try:
        conn = get_conn()
        if reg_no:
            rows = fetch_by_reg_no(conn, reg_no, type)
        elif pan:
            rows = fetch_by_pan(conn, pan, type)
        elif upi:
            rows = fetch_by_upi(conn, upi, type)
        else:
            rows = fetch_by_name_fuzzy(conn, name, type) if fuzzy else fetch_by_name_exact(conn, name, type)
        conn.close()
    except FileNotFoundError as fe:
        raise HTTPException(status_code=500, detail=str(fe))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Attach compact risk summary per row
    for r in rows:
        r["risk"] = summarize_risk(r)

    return {
        "query": {"reg_no": reg_no, "pan": pan, "upi": upi, "name": name, "type": type, "fuzzy": bool(fuzzy)},
        "count": len(rows),
        "matches": rows,
    }
