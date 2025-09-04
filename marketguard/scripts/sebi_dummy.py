# sebi_dummy.py
# ------------------------------------------------------------
# Generate a synthetic SEBI-like SQLite database with:
# - Users (with PAN-like ID, intermediary_type, SEBI reg no)
# - UPI accounts (unique upi_id enforced safely)
# - Login attempts
# - Malicious activities (with risk scoring)
#
# Usage:
#   python sebi_dummy.py --db sebi_dummy.db --users 1000 --no-interactive
# ------------------------------------------------------------

import argparse
import hashlib
import random
import sqlite3
import string
import time
from datetime import datetime
from typing import Optional

from faker import Faker

# --------------------------- Config ---------------------------

INTERMEDIARY_TYPES = ["IA", "RA", "PMS", "BROKER", "NONE"]
INTERMEDIARY_WEIGHTS = [0.15, 0.15, 0.15, 0.25, 0.30]
SEBI_PREFIX = {"IA": "INA", "RA": "INH", "PMS": "INP", "BROKER": "INZ"}

BANKS = [
    "State Bank of India",
    "HDFC Bank",
    "ICICI Bank",
    "Axis Bank",
    "Yes Bank",
    "Kotak Mahindra Bank",
]
UPI_HANDLES = ["ybl", "oksbi", "axl", "paytm"]
IFSC_BANK_CODES = ["SBIN", "HDFC", "ICIC", "AXIS", "YESB", "UTIB"]

FAKE = Faker("en_IN")  # Indian context


# --------------------------- Helpers ---------------------------

def generate_password_hash(password: str) -> str:
    """Generate a simple salted hash (demo only)."""
    salt = "sebi_dummy_salt_"
    return hashlib.sha256((password + salt).encode()).hexdigest()


def safe_phone() -> str:
    """Generate a compact phone-like string (digits only, 10-12 chars)."""
    raw = "".join(ch for ch in FAKE.phone_number() if ch.isdigit())
    if len(raw) < 10:
        raw = f"9{raw}{''.join(random.choices(string.digits, k=max(0, 10-len(raw))))}"
    return raw[:12]


def gen_username(full_name: str) -> str:
    parts = full_name.lower().split()
    if len(parts) >= 2:
        return f"{parts[0][0]}{parts[-1]}{random.randint(100, 999)}"
    return f"{full_name.lower().replace(' ', '')}{random.randint(1000, 9999)}"


def gen_upi_id(full_name: str) -> str:
    handle = full_name.lower().split()[-1] if " " in full_name else full_name.lower()
    return f"{handle}@{random.choice(UPI_HANDLES)}"


def gen_ifsc() -> str:
    return f"{random.choice(IFSC_BANK_CODES)}0{random.randint(100000, 999999)}"


def gen_pan() -> str:
    """PAN-like format: AAAAA9999A (synthetic)."""
    letters = "".join(random.choices(string.ascii_uppercase, k=5))
    digits = "".join(random.choices(string.digits, k=4))
    last = random.choice(string.ascii_uppercase)
    return f"{letters}{digits}{last}"


def gen_sebi_reg(intermediary_type: str) -> Optional[str]:
    """SEBI reg no like INA/INH/INP/INZ + 8 digits."""
    prefix = SEBI_PREFIX.get(intermediary_type)
    if not prefix:
        return None
    return f"{prefix}{random.randint(0, 99_999_999):08d}"


def to_date_str(dt) -> str:
    return dt.strftime("%Y-%m-%d")


def to_dt_str(dt) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


# --------------------------- Core Class ---------------------------

class SEBIDummyDB:
    def __init__(self, db_name="sebi_dummy.db", seed=None):
        self.db_name = db_name
        if seed is not None:
            random.seed(seed)
            Faker.seed(seed)

    def get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_name)
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        conn.execute("PRAGMA synchronous = NORMAL")
        return conn

    def setup_database(self):
        conn = self.get_connection()
        cur = conn.cursor()

        # Users table
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT,
                registration_date TEXT NOT NULL,   -- YYYY-MM-DD
                last_login TEXT,                   -- YYYY-MM-DD
                account_status TEXT DEFAULT 'active',
                malicious_activity_history INTEGER DEFAULT 0,
                -- Enrichment fields:
                pan_id TEXT,
                intermediary_type TEXT,            -- IA/RA/PMS/BROKER/NONE
                sebi_reg_no TEXT                   -- INA/INH/INP/INZ + 8 digits
            )
            """
        )

        # UPI accounts
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS upi_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                upi_id TEXT UNIQUE NOT NULL,
                bank_name TEXT NOT NULL,
                account_number TEXT NOT NULL,
                ifsc_code TEXT NOT NULL,
                verification_status TEXT DEFAULT 'pending',
                created_date TEXT NOT NULL,        -- YYYY-MM-DD
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
            """
        )

        # Login attempts
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS login_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                attempt_time TEXT NOT NULL,        -- YYYY-MM-DD HH:MM:SS
                success INTEGER NOT NULL,
                ip_address TEXT
            )
            """
        )

        # Malicious activities
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS malicious_activities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                activity_type TEXT NOT NULL,
                activity_date TEXT NOT NULL,       -- YYYY-MM-DD HH:MM:SS
                severity TEXT CHECK(severity IN ('low','medium','high')),
                description TEXT,
                resolved INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
            """
        )

        # Helpful indexes
        cur.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_users_sebi ON users(sebi_reg_no)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_upi_user ON upi_accounts(user_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_upi_upi_id ON upi_accounts(upi_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_mal_user ON malicious_activities(user_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_login_username ON login_attempts(username)")

        conn.commit()
        conn.close()

    # -------- Data Generation --------

    def _preload_used_upis(self, cur) -> set:
        """Load any existing UPI IDs from DB to avoid unique constraint violations."""
        cur.execute("SELECT upi_id FROM upi_accounts")
        return {row[0] for row in cur.fetchall() if row[0]}

    def generate_dummy_data(self, num_users=1000, commit_every=200):
        print(f"Generating {num_users} users...")

        conn = self.get_connection()
        cur = conn.cursor()

        used_upis = self._preload_used_upis(cur)  # preload existing UPI IDs
        start_time = time.time()
        inserts = 0

        try:
            for i in range(num_users):
                # --- User basics ---
                full_name = FAKE.name()
                username = gen_username(full_name)
                email = FAKE.email()
                phone = safe_phone()

                # Keep as date objects for Faker computations
                registration_date_dt = FAKE.date_between(start_date="-2y", end_date="today")
                last_login_dt = FAKE.date_between(start_date=registration_date_dt, end_date="today")

                # Convert to strings for DB
                registration_date = to_date_str(registration_date_dt)
                last_login = to_date_str(last_login_dt)

                password_hash = generate_password_hash("Password123")

                # Enrichment fields
                intermediary_type = random.choices(
                    INTERMEDIARY_TYPES, weights=INTERMEDIARY_WEIGHTS, k=1
                )[0]
                pan_id = gen_pan()
                sebi_reg_no = gen_sebi_reg(intermediary_type)

                # Flags
                account_status = random.choices(
                    ["active", "suspended", "closed"], weights=[0.9, 0.06, 0.04], k=1
                )[0]
                has_mal_history = 1 if random.random() < 0.15 else 0

                # Insert user
                cur.execute(
                    """
                    INSERT INTO users
                    (username, password_hash, full_name, email, phone, registration_date, last_login,
                     account_status, malicious_activity_history, pan_id, intermediary_type, sebi_reg_no)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        username,
                        password_hash,
                        full_name,
                        email,
                        phone,
                        registration_date,
                        last_login,
                        account_status,
                        has_mal_history,
                        pan_id,
                        intermediary_type,
                        sebi_reg_no,
                    ),
                )
                user_id = cur.lastrowid

                # Malicious activities
                if has_mal_history:
                    self._add_malicious_activities(cur, user_id, random.randint(1, 5))

                # UPI account for ~80% users (ensure uniqueness of upi_id)
                if random.random() < 0.8:
                    # regenerate until a unique UPI is found
                    while True:
                        upi_id = gen_upi_id(full_name)
                        if upi_id not in used_upis:
                            used_upis.add(upi_id)
                            break

                    bank_name = random.choice(BANKS)
                    account_number = "".join(random.choices(string.digits, k=12))
                    ifsc_code = gen_ifsc()
                    created_date = to_date_str(
                        FAKE.date_between(start_date=registration_date_dt, end_date="today")
                    )
                    verification_status = random.choices(
                        ["verified", "pending", "rejected"], weights=[0.7, 0.2, 0.1], k=1
                    )[0]
                    cur.execute(
                        """
                        INSERT INTO upi_accounts
                        (user_id, upi_id, bank_name, account_number, ifsc_code,
                         verification_status, created_date)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            user_id,
                            upi_id,
                            bank_name,
                            account_number,
                            ifsc_code,
                            verification_status,
                            created_date,
                        ),
                    )

                # Login attempts (1–15)
                for _ in range(random.randint(1, 15)):
                    attempt_time = to_dt_str(
                        FAKE.date_time_between(start_date=registration_date_dt, end_date="now")
                    )
                    success = random.choices([0, 1], weights=[0.2, 0.8], k=1)[0]
                    ip_address = FAKE.ipv4()
                    cur.execute(
                        """
                        INSERT INTO login_attempts (username, attempt_time, success, ip_address)
                        VALUES (?, ?, ?, ?)
                        """,
                        (username, attempt_time, success, ip_address),
                    )

                inserts += 1
                if inserts % commit_every == 0:
                    conn.commit()
                    elapsed = time.time() - start_time
                    print(f"  ... {inserts}/{num_users} committed in {elapsed:.1f}s")

            conn.commit()
        finally:
            conn.close()

        total_time = time.time() - start_time
        print(f"Done. Generated {num_users} users in {total_time:.1f}s")

    def _add_malicious_activities(self, cur: sqlite3.Cursor, user_id: int, count=1):
        activity_types = [
            "Suspicious login attempt",
            "Multiple failed transactions",
            "Unusual transfer pattern",
            "Account sharing detected",
            "Identity verification failed",
            "High-risk transaction attempt",
            "Multiple account access from different locations",
            "Unusual login time pattern",
            "Transaction amount anomaly",
            "Frequent password reset attempts",
        ]
        severities = ["low", "medium", "high"]

        for _ in range(count):
            activity_type = random.choice(activity_types)
            activity_date = to_dt_str(
                FAKE.date_time_between(start_date="-1y", end_date="now")
            )
            severity = random.choices(severities, weights=[0.5, 0.3, 0.2], k=1)[0]
            description = f"{activity_type} detected on {activity_date}"
            resolved = random.choices([0, 1], weights=[0.7, 0.3], k=1)[0]
            cur.execute(
                """
                INSERT INTO malicious_activities
                (user_id, activity_type, activity_date, severity, description, resolved)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (user_id, activity_type, activity_date, severity, description, resolved),
            )

    # -------- Query/Risk --------

    def check_upi_id(self, upi_id):
        """Return (exists, risk_level, user_details, risk_reasons)."""
        conn = self.get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT u.*, upi.upi_id, upi.bank_name, upi.verification_status,
                   COUNT(m.id) as mal_count,
                   SUM(CASE WHEN m.resolved = 0 THEN 1 ELSE 0 END) as unresolved
            FROM users u
            JOIN upi_accounts upi ON u.id = upi.user_id
            LEFT JOIN malicious_activities m ON u.id = m.user_id
            WHERE upi.upi_id = ?
            GROUP BY u.id
            """,
            (upi_id,),
        )
        row = cur.fetchone()
        conn.close()

        if not row:
            return False, None, None, ["UPI ID not found in database"]

        user_details = {
            "id": row[0],
            "username": row[1],
            "full_name": row[3],
            "email": row[4],
            "phone": row[5],
            "registration_date": row[6],
            "last_login": row[7],
            "account_status": row[8],
            "malicious_history_flag": row[9],
            "pan_id": row[10],
            "intermediary_type": row[11],
            "sebi_reg_no": row[12],
            "upi_id": row[13],
            "bank_name": row[14],
            "verification_status": row[15],
            "malicious_activity_count": row[16] or 0,
            "unresolved_activities": row[17] or 0,
        }

        risk_level, risk_reasons = self.assess_risk(user_details)
        return True, risk_level, user_details, risk_reasons

    def assess_risk(self, user_details):
        risk_score = 0
        reasons = []

        if user_details["malicious_history_flag"] == 1:
            risk_score += 30
            reasons.append("User has history of malicious activities")

        if user_details["malicious_activity_count"] > 0:
            risk_score += user_details["malicious_activity_count"] * 10
            reasons.append(
                f"{user_details['malicious_activity_count']} malicious activities recorded"
            )

        if user_details["unresolved_activities"] > 0:
            risk_score += user_details["unresolved_activities"] * 15
            reasons.append(
                f"{user_details['unresolved_activities']} unresolved malicious activities"
            )

        if user_details["account_status"] != "active":
            risk_score += 25
            reasons.append(f"Account status: {user_details['account_status']}")

        if user_details["verification_status"] != "verified":
            risk_score += 20
            reasons.append(f"UPI verification status: {user_details['verification_status']}")

        try:
            reg_dt = datetime.strptime(user_details["registration_date"], "%Y-%m-%d")
            if (datetime.now() - reg_dt).days < 30:
                risk_score += 15
                reasons.append("Account is less than 30 days old")
        except Exception:
            pass

        if risk_score >= 70:
            level = "HIGH RISK"
        elif risk_score >= 40:
            level = "MEDIUM RISK"
        elif risk_score >= 20:
            level = "LOW RISK"
        else:
            level = "SAFE"

        return level, reasons

    def display_risk_report(self, upi_id):
        exists, level, details, reasons = self.check_upi_id(upi_id)
        print("=" * 60)
        print("UPI ID RISK ASSESSMENT REPORT")
        print("=" * 60)

        if not exists:
            print(f"❌ UPI ID '{upi_id}' NOT FOUND in database")
            print("=" * 60)
            return None

        print(f"✅ UPI ID '{upi_id}' FOUND in database")
        print("\n--- USER DETAILS ---")
        print(f"Name: {details['full_name']}")
        print(f"Username: {details['username']}")
        print(f"Email: {details['email']}")
        print(f"Phone: {details['phone']}")
        print(f"PAN: {details['pan_id']}")
        print(f"Intermediary Type: {details['intermediary_type']}")
        print(f"SEBI Reg No: {details['sebi_reg_no']}")
        print(f"Bank: {details['bank_name']}")
        print(f"Account Status: {details['account_status']}")
        print(f"Verification Status: {details['verification_status']}")
        print(f"Registration Date: {details['registration_date']}")
        print(f"Malicious Activities: {details['malicious_activity_count']}")
        print(f"Unresolved Activities: {details['unresolved_activities']}")

        print(f"\n--- RISK ASSESSMENT ---")
        print(f"RISK LEVEL: {level}")
        if reasons:
            print("\nRisk Factors Detected:")
            for i, r in enumerate(reasons, 1):
                print(f"{i}. {r}")
        else:
            print("No significant risk factors detected.")
        print("=" * 60)
        return level

    def get_database_stats(self):
        conn = self.get_connection()
        cur = conn.cursor()

        cur.execute("SELECT COUNT(*) FROM users")
        total_users = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM upi_accounts")
        total_upi = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM users WHERE malicious_activity_history=1")
        mal_users = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM malicious_activities")
        total_mal = cur.fetchone()[0]

        conn.close()

        pct = (mal_users / total_users * 100) if total_users else 0.0
        print("\n" + "=" * 50)
        print("DATABASE STATISTICS")
        print("=" * 50)
        print(f"Total Users: {total_users}")
        print(f"Total UPI Accounts: {total_upi}")
        print(f"Users with Malicious History: {mal_users} ({pct:.1f}%)")
        print(f"Total Malicious Activities: {total_mal}")
        print("=" * 50)

        return {
            "total_users": total_users,
            "total_upi_accounts": total_upi,
            "malicious_users": mal_users,
            "total_malicious_activities": total_mal,
        }


# --------------------------- CLI ---------------------------

def main():
    parser = argparse.ArgumentParser(description="Build a synthetic SEBI-like SQLite DB.")
    parser.add_argument("--db", default="sebi_dummy.db", help="Output SQLite file")
    parser.add_argument("--users", type=int, default=1000, help="Number of users")
    parser.add_argument("--seed", type=int, default=None, help="Random seed for reproducibility")
    parser.add_argument("--no-interactive", action="store_true", help="Skip interactive UPI check")
    args = parser.parse_args()

    sebi = SEBIDummyDB(db_name=args.db, seed=args.seed)

    print("Setting up database tables & indexes...")
    sebi.setup_database()

    print(f"Generating data into {args.db} ...")
    sebi.generate_dummy_data(num_users=args.users)

    # Stats
    sebi.get_database_stats()

    # Show sample UPI IDs
    conn = sebi.get_connection()
    cur = conn.cursor()
    cur.execute("SELECT upi_id FROM upi_accounts LIMIT 10")
    sample_upi_ids = [row[0] for row in cur.fetchall()]
    conn.close()

    if sample_upi_ids:
        print("\nSample UPI IDs for testing:")
        for i, upi in enumerate(sample_upi_ids, 1):
            print(f"{i}. {upi}")

    if not args.no_interactive:
        print("\n" + "=" * 50)
        print("UPI ID VERIFICATION SYSTEM")
        print("=" * 50)
        try:
            while True:
                upi_id = input("\nEnter UPI ID to check (or 'quit' to exit): ").strip()
                if upi_id.lower() == "quit":
                    break
                if not upi_id:
                    print("Please enter a valid UPI ID")
                    continue
                sebi.display_risk_report(upi_id)

                another = input("\nCheck another UPI ID? (y/n): ").lower().strip()
                if another != "y":
                    break
        except (EOFError, KeyboardInterrupt):
            pass

        print("\nThank you for using the UPI ID Verification System!")


if __name__ == "__main__":
    main()
