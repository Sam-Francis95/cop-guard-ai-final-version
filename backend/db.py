import sqlite3
import os
import bcrypt
from datetime import datetime, timedelta

# Database path
DB_PATH = os.path.join(os.path.dirname(__file__), 'users.db')

def get_db_connection():
    """Returns a connection with sqlite3.Row for key-access."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# -----------------------------
# INIT DATABASE
# -----------------------------
def init_db():
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Tables will persist across restarts
        # cursor.execute("DROP TABLE IF EXISTS users")

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            age INTEGER NOT NULL,
            phone TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            last_location_lat REAL,
            last_location_lon REAL,
            last_seen TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

        # Create AI Claims table
        # cursor.execute("DROP TABLE IF EXISTS ai_claims")
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_claims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            claim_id TEXT UNIQUE NOT NULL,
            user_id INTEGER NOT NULL,
            worker_id TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            location_lat REAL,
            location_lng REAL,
            reason TEXT,
            distress_condition TEXT,
            ai_confidence INTEGER DEFAULT 0,
            risk_score INTEGER DEFAULT 0,
            risk_level TEXT DEFAULT 'LOW' CHECK(risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
            ai_status TEXT DEFAULT 'SAFE' CHECK(ai_status IN ('SAFE', 'WARNING', 'CRITICAL')),
            status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'SENT', 'REJECTED', 'APPROVED')),
            source TEXT DEFAULT 'AI_GENERATED' CHECK(source IN ('AI_GENERATED', 'MANUAL')),
            detection_signals TEXT,
            admin_notes TEXT,
            decision_type TEXT DEFAULT 'AUTO' CHECK(decision_type IN ('AUTO', 'MANUAL')),
            decision_action TEXT CHECK(decision_action IN ('AUTO_APPROVED', 'ESCALATED_FOR_REVIEW', 'AUTO_REJECTED')),
            decided_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)

        # Create worker risk tracking table
        # cursor.execute("DROP TABLE IF EXISTS worker_risk_tracking")
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS worker_risk_tracking (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            current_risk_score INTEGER DEFAULT 0,
            risk_level TEXT DEFAULT 'LOW' CHECK(risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
            ai_status TEXT DEFAULT 'SAFE' CHECK(ai_status IN ('SAFE', 'WARNING', 'CRITICAL')),
            reasons TEXT DEFAULT '[]',
            last_claim_id TEXT,
            last_claim_time TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)

        # Create Claims Lifecycle table (MAIN SYSTEM)
        # STATUS values: SENT (newly raised), PENDING (under review), APPROVED, REJECTED
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS claims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            claim_id TEXT UNIQUE NOT NULL,
            worker_id TEXT NOT NULL,
            worker_name TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            event_type TEXT CHECK(event_type IN ('AUTO', 'MANUAL')),
            event_source TEXT CHECK(event_source IN ('location', 'weather', 'network', 'activity', 'user')),
            claim_type TEXT DEFAULT 'GENERAL',
            description TEXT,
            location_lat REAL DEFAULT 0.0,
            location_lng REAL DEFAULT 0.0,

            risk_score INTEGER DEFAULT 0,
            risk_level TEXT CHECK(risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
            ai_confidence REAL DEFAULT 0.0,

            ai_verdict TEXT CHECK(ai_verdict IN ('APPROVED', 'REJECTED', 'PENDING')),
            auto_decision TEXT CHECK(auto_decision IN ('APPROVED', 'REJECTED', 'PENDING')),

            ai_reasoning_summary TEXT,
            ai_reasoning_factors TEXT,

            status TEXT DEFAULT 'SENT' CHECK(status IN ('SENT', 'PENDING', 'APPROVED', 'REJECTED')),
            admin_override_reason TEXT,

            payment_status TEXT DEFAULT 'UNPAID' CHECK(payment_status IN ('UNPAID', 'INITIATED', 'PAID', 'FAILED')),
            payment_id TEXT,
            order_id TEXT,
            payout_amount INTEGER DEFAULT 0,

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

        # ── MIGRATION: fix CHECK constraint to include SENT, add new columns ──
        # SQLite doesn't allow ALTER TABLE to change CHECK constraints, so we must
        # recreate the table if the old constraint is in place.
        try:
            # Check current schema for the claims table
            row = cursor.execute(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='claims'"
            ).fetchone()
            if row:
                table_sql = row[0]
                # If the old constraint doesn't include SENT, rebuild the table
                if "'SENT'" not in table_sql and '\"SENT\"' not in table_sql:
                    print("[DB-MIGRATION] Rebuilding claims table to add SENT status...")
                    cursor.executescript("""
                        PRAGMA foreign_keys = OFF;

                        CREATE TABLE IF NOT EXISTS claims_new (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            claim_id TEXT UNIQUE NOT NULL,
                            worker_id TEXT NOT NULL,
                            worker_name TEXT NOT NULL,
                            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            event_type TEXT CHECK(event_type IN ('AUTO', 'MANUAL')),
                            event_source TEXT CHECK(event_source IN ('location', 'weather', 'network', 'activity', 'user')),
                            claim_type TEXT DEFAULT 'GENERAL',
                            description TEXT,
                            location_lat REAL DEFAULT 0.0,
                            location_lng REAL DEFAULT 0.0,
                            risk_score INTEGER DEFAULT 0,
                            risk_level TEXT CHECK(risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
                            ai_confidence REAL DEFAULT 0.0,
                            ai_verdict TEXT CHECK(ai_verdict IN ('APPROVED', 'REJECTED', 'PENDING')),
                            auto_decision TEXT CHECK(auto_decision IN ('APPROVED', 'REJECTED', 'PENDING')),
                            ai_reasoning_summary TEXT,
                            ai_reasoning_factors TEXT,
                            status TEXT DEFAULT 'SENT' CHECK(status IN ('SENT', 'PENDING', 'APPROVED', 'REJECTED')),
                            admin_override_reason TEXT,
                            payment_status TEXT DEFAULT 'UNPAID' CHECK(payment_status IN ('UNPAID', 'INITIATED', 'PAID', 'FAILED')),
                            payment_id TEXT,
                            order_id TEXT,
                            payout_amount INTEGER DEFAULT 0,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        );

                        INSERT INTO claims_new
                            (id, claim_id, worker_id, worker_name, timestamp, event_type, event_source,
                             description, risk_score, risk_level, ai_confidence,
                             ai_verdict, auto_decision, ai_reasoning_summary, ai_reasoning_factors,
                             status, admin_override_reason, payment_status, payment_id,
                             order_id, payout_amount, created_at, updated_at)
                        SELECT
                            id, claim_id, worker_id, worker_name, timestamp, event_type, event_source,
                            description, risk_score, risk_level, ai_confidence,
                            ai_verdict, auto_decision, ai_reasoning_summary, ai_reasoning_factors,
                            CASE
                                WHEN status IN ('SENT', 'PENDING', 'APPROVED', 'REJECTED') THEN status
                                ELSE 'SENT'
                            END,
                            admin_override_reason, payment_status, payment_id,
                            order_id, payout_amount, created_at, updated_at
                        FROM claims;

                        DROP TABLE claims;
                        ALTER TABLE claims_new RENAME TO claims;

                        PRAGMA foreign_keys = ON;
                    """)
                    conn.commit()
                    print("[DB-MIGRATION] claims table rebuilt successfully with SENT status support.")
        except Exception as _mig_err:
            print(f"[DB-MIGRATION-WARNING] Claims table migration issue: {_mig_err}")

        # Add new columns if they don't exist yet (safe — silently ignores if already added)
        _col_migrations = [
            "ALTER TABLE claims ADD COLUMN claim_type TEXT DEFAULT 'GENERAL'",
            "ALTER TABLE claims ADD COLUMN location_lat REAL DEFAULT 0.0",
            "ALTER TABLE claims ADD COLUMN location_lng REAL DEFAULT 0.0",
        ]
        for _sql in _col_migrations:
            try:
                cursor.execute(_sql)
                conn.commit()
            except Exception:
                pass  # Column already exists — silently ignore


        # Seed Admin (optional - comment out if not needed for worker-only app)
        # hashed_admin_pw = bcrypt.hashpw('Admin@123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        # cursor.execute("""
        # INSERT INTO users (name, age, phone, password)
        # VALUES (?, ?, ?, ?)
        # """, ('System Admin', 0, 'admin@copguard', hashed_admin_pw))

        conn.commit()
        print(f"[DB-INIT] Database initialized successfully at {DB_PATH}")
    except Exception as e:
        print(f"[DB-INIT-ERROR] Failed to initialize database: {str(e)}")
        if conn:
            try:
                conn.rollback()
            except:
                pass
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


# =============================
# USER REGISTRATION & LOGIN
# =============================

def register_user(name, age, phone, hashed_password):
    """Register a new user with hashed password"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO users (name, age, phone, password)
            VALUES (?, ?, ?, ?)
        """, (name, age, phone, hashed_password))
        
        user_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return {
            'success': True,
            'user_id': user_id,
            'message': 'Registration successful'
        }
    except sqlite3.IntegrityError as e:
        if 'phone' in str(e).lower():
            return {
                'success': False,
                'message': 'Phone number already registered'
            }
        return {
            'success': False,
            'message': f'Registration failed: {str(e)}'
        }
    except Exception as e:
        return {
            'success': False,
            'message': f'Registration error: {str(e)}'
        }


def get_user_by_phone(phone):
    """Get user by phone number"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT id, name, age, phone, password FROM users WHERE phone = ?", (phone,))
        user = cursor.fetchone()
        conn.close()
        
        return user
    except Exception as e:
        print(f"[DB-ERROR] get_user_by_phone: {str(e)}")
        return None


def login_user(phone, password_to_check):
    """Validate user login credentials"""
    try:
        user = get_user_by_phone(phone)
        
        if not user:
            return {
                'success': False,
                'message': 'User not found'
            }
        
        # user[4] is the password hash
        if bcrypt.checkpw(password_to_check.encode('utf-8'), user[4].encode('utf-8')):
            return {
                'success': True,
                'user': {
                    'id': user[0],
                    'name': user[1],
                    'age': user[2],
                    'phone': user[3]
                },
                'message': 'Login successful'
            }
        else:
            return {
                'success': False,
                'message': 'Invalid password'
            }
    except Exception as e:
        return {
            'success': False,
            'message': f'Login error: {str(e)}'
        }


# ---------------------------------
# SUBSCRIBE USER (STEP 0) - LEGACY
# ---------------------------------
def subscribe_user(name, platform, location):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    start = datetime.utcnow()
    end = start + timedelta(days=7)

    cursor.execute("""
        INSERT INTO users (
            full_name, role, password, platform, location,
            is_subscribed, subscription_start, subscription_end
        )
        VALUES (?, 'worker', 'subscribed_user', ?, ?, 1, ?, ?)
    """, (name, platform, location, start, end))

    user_id = cursor.lastrowid

    conn.commit()
    conn.close()

    return {
        "id": user_id,
        "name": name,
        "platform": platform,
        "location": location,
        "subscription_start": str(start),
        "subscription_end": str(end),
        "message": "Subscription activated successfully"
    }


# -----------------------------
# GET USER BY ID
# -----------------------------
def get_user(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()

    conn.close()
    return user


# -----------------------------
# UPDATE LAST SEEN
# -----------------------------
def update_last_seen(user_id):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE users
        SET last_seen = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (user_id,))

    conn.commit()
    conn.close()


# -----------------------------
# CHECK ACTIVE SUBSCRIPTION
# -----------------------------
def is_subscription_active(user_id):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT subscription_end FROM users WHERE id = ?
    """, (user_id,))

    result = cursor.fetchone()
    conn.close()

    if result and result[0]:
        try:
            # End time could be saved as ISO string or something else
            # SQLite format is usually YYYY-MM-DD HH:MM:SS
            end_time = datetime.fromisoformat(result[0])
            return datetime.utcnow() < end_time
        except ValueError:
            # If not ISO, might be standard str(datetime)
            return False

    return False


# ─────────────────────────────────
# AI CLAIMS MANAGEMENT
# ─────────────────────────────────

def create_ai_claim(user_id, worker_id, location_lat, location_lng, reason, distress_condition, ai_confidence, detection_signals=None):
    """Create an autonomous AI-generated claim."""
    import uuid
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    claim_id = f"AIC-{uuid.uuid4().hex[:12].upper()}"
    
    cursor.execute("""
        INSERT INTO ai_claims 
        (claim_id, user_id, worker_id, location_lat, location_lng, reason, distress_condition, ai_confidence, detection_signals, status, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'AI_GENERATED')
    """, (claim_id, user_id, worker_id, location_lat, location_lng, reason, distress_condition, ai_confidence, detection_signals))
    
    conn.commit()
    claim_row_id = cursor.lastrowid
    conn.close()
    
    return {
        "id": claim_row_id,
        "claim_id": claim_id,
        "user_id": user_id,
        "worker_id": worker_id,
        "status": "PENDING",
        "source": "AI_GENERATED",
        "timestamp": datetime.utcnow().isoformat(),
        "location": {"lat": location_lat, "lng": location_lng},
        "reason": reason,
        "ai_confidence": ai_confidence
    }


def get_all_ai_claims():
    """Retrieve all AI-generated autonomous claims (source='AI_GENERATED')."""
    conn = get_db_connection()
    
    claims = conn.execute("""
        SELECT 
            ac.id, ac.claim_id, ac.user_id, ac.worker_id, ac.timestamp,
            ac.location_lat, ac.location_lng, ac.reason, ac.distress_condition,
            ac.ai_confidence, ac.risk_score, ac.risk_level, ac.ai_status,
            ac.status, ac.source, ac.detection_signals, ac.admin_notes,
            ac.created_at, ac.updated_at,
            u.full_name, u.age, u.phone_number
        FROM ai_claims ac
        LEFT JOIN users u ON ac.user_id = u.id
        WHERE ac.source = 'AI_GENERATED'
        ORDER BY ac.created_at DESC
    """).fetchall()
    
    conn.close()
    
    return [dict(c) for c in claims]


def get_ai_claim_by_id(claim_id):
    """Get a specific AI claim by claim_id."""
    conn = get_db_connection()
    
    claim = conn.execute("""
        SELECT 
            ac.id, ac.claim_id, ac.user_id, ac.worker_id, ac.timestamp,
            ac.location_lat, ac.location_lng, ac.reason, ac.distress_condition,
            ac.ai_confidence, ac.status, ac.detection_signals, ac.admin_notes,
            ac.created_at, ac.updated_at,
            u.full_name, u.age, u.phone_number
        FROM ai_claims ac
        LEFT JOIN users u ON ac.user_id = u.id
        WHERE ac.claim_id = ?
    """, (claim_id,)).fetchone()
    
    conn.close()
    
    return dict(claim) if claim else None


def get_pending_ai_claims():
    """Retrieve only pending AI-GENERATED claims for admin review."""
    conn = get_db_connection()
    
    claims = conn.execute("""
        SELECT 
            ac.id, ac.claim_id, ac.user_id, ac.worker_id, ac.timestamp,
            ac.location_lat, ac.location_lng, ac.reason, ac.distress_condition,
            ac.ai_confidence, ac.risk_score, ac.risk_level, ac.ai_status,
            ac.status, ac.source, ac.detection_signals, ac.admin_notes,
            ac.created_at, ac.updated_at,
            u.full_name, u.age, u.phone_number
        FROM ai_claims ac
        LEFT JOIN users u ON ac.user_id = u.id
        WHERE ac.status = 'PENDING' AND ac.source = 'AI_GENERATED'
        ORDER BY ac.created_at DESC
    """).fetchall()
    
    conn.close()
    
    return [dict(c) for c in claims]


def update_ai_claim_status(claim_id, new_status, admin_notes=None):
    """Update claim status (approved/rejected) with optional admin notes."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        UPDATE ai_claims 
        SET status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE claim_id = ?
    """, (new_status, admin_notes, claim_id))
    
    conn.commit()
    conn.close()
    
    return get_ai_claim_by_id(claim_id)


def get_claims_by_worker(worker_id):
    """Get all AI-GENERATED claims for a specific worker."""
    conn = get_db_connection()
    
    claims = conn.execute("""
        SELECT 
            ac.id, ac.claim_id, ac.user_id, ac.worker_id, ac.timestamp,
            ac.location_lat, ac.location_lng, ac.reason, ac.distress_condition,
            ac.ai_confidence, ac.risk_score, ac.risk_level, ac.ai_status,
            ac.status, ac.source, ac.detection_signals, ac.admin_notes,
            ac.created_at, ac.updated_at,
            u.full_name, u.age, u.phone_number
        FROM ai_claims ac
        LEFT JOIN users u ON ac.user_id = u.id
        WHERE ac.worker_id = ? AND ac.source = 'AI_GENERATED'
        ORDER BY ac.created_at DESC
    """, (worker_id,)).fetchall()
    
    conn.close()
    
    return [dict(c) for c in claims]


# ─────────────────────────────────
# WORKER RISK TRACKING
# ─────────────────────────────────

def upsert_worker_risk(user_id, risk_score, risk_level, ai_status, reasons):
    """Update or create worker risk tracking record."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT INTO worker_risk_tracking 
        (user_id, current_risk_score, risk_level, ai_status, reasons, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
        current_risk_score = excluded.current_risk_score,
        risk_level = excluded.risk_level,
        ai_status = excluded.ai_status,
        reasons = excluded.reasons,
        updated_at = CURRENT_TIMESTAMP
    """, (user_id, risk_score, risk_level, ai_status, reasons))
    
    conn.commit()
    conn.close()


def get_worker_risk(user_id):
    """Get current risk status for a worker."""
    conn = get_db_connection()
    
    risk = conn.execute("""
        SELECT 
            user_id, current_risk_score, risk_level, ai_status, reasons,
            last_claim_id, last_claim_time, updated_at
        FROM worker_risk_tracking
        WHERE user_id = ?
    """, (user_id,)).fetchone()
    
    conn.close()
    
    if risk:
        return dict(risk)
    return None


def check_duplicate_claim(user_id, time_window_minutes=5):
    """Check if worker has a claim created within the specified time window."""
    conn = get_db_connection()
    
    cutoff_time = datetime.utcnow() - timedelta(minutes=time_window_minutes)
    
    claim = conn.execute("""
        SELECT claim_id, created_at FROM ai_claims
        WHERE user_id = ? AND status = 'PENDING' AND created_at > ?
        ORDER BY created_at DESC LIMIT 1
    """, (user_id, cutoff_time)).fetchone()
    
    conn.close()
    
    return dict(claim) if claim else None


# ========================================
# CLAIM LIFECYCLE MANAGEMENT
# ========================================

def create_claim(worker_id, worker_name, event_type, event_source, description,
                 claim_type='GENERAL', location_lat=0.0, location_lng=0.0):
    """Create a new claim (auto or manual). Initial status is always SENT."""
    from uuid import uuid4

    try:
        conn = get_db_connection()

        # Generate unique claim ID
        claim_id = f"CLM-{uuid4().hex[:8].upper()}"

        conn.execute("""
            INSERT INTO claims
            (claim_id, worker_id, worker_name, event_type, event_source, description,
             claim_type, location_lat, location_lng, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SENT')
        """, (
            claim_id, worker_id, worker_name, event_type, event_source, description,
            claim_type, location_lat, location_lng
        ))

        conn.commit()
        conn.close()

        return {
            'success': True,
            'claim_id': claim_id,
            'message': 'Claim created successfully'
        }
    except Exception as e:
        print(f"[CLAIM-CREATE-ERROR] {str(e)}")
        return {
            'success': False,
            'message': f'Failed to create claim: {str(e)}'
        }


def update_claim_with_verdict(claim_id, risk_score, risk_level, ai_confidence, 
                             ai_verdict, ai_reasoning_summary, ai_reasoning_factors):
    """Update claim with AI analysis results.
    
    NOTE: This does NOT change the claim status — status stays SENT until admin acts.
    ai_verdict stores the AI recommendation separately from the workflow status.
    """
    import json
    try:
        conn = get_db_connection()
        
        # auto_decision mirrors ai_verdict initially
        auto_decision = ai_verdict
        
        conn.execute("""
            UPDATE claims 
            SET risk_score = ?,
                risk_level = ?,
                ai_confidence = ?,
                ai_verdict = ?,
                auto_decision = ?,
                ai_reasoning_summary = ?,
                ai_reasoning_factors = ?,
                updated_at = ?
            WHERE claim_id = ?
        """, (risk_score, risk_level, ai_confidence, ai_verdict, auto_decision,
              ai_reasoning_summary, json.dumps(ai_reasoning_factors),
              datetime.utcnow().isoformat(), claim_id))
        
        conn.commit()
        conn.close()
        
        return {'success': True, 'message': 'Claim updated with verdict'}
    except Exception as e:
        print(f"[CLAIM-UPDATE-ERROR] {str(e)}")
        return {'success': False, 'message': str(e)}


def get_all_claims(status_filter=None):
    """Retrieve all claims, optionally filtered by status."""
    conn = get_db_connection()

    if status_filter and status_filter.upper() != 'ALL':
        claims = [dict(row) for row in conn.execute(
            "SELECT * FROM claims WHERE status = ? ORDER BY created_at DESC",
            (status_filter.upper(),)
        ).fetchall()]
    else:
        claims = [dict(row) for row in conn.execute(
            "SELECT * FROM claims ORDER BY created_at DESC"
        ).fetchall()]

    conn.close()
    return claims


def get_worker_claims(worker_id, status_filter=None):
    """Get all claims for a specific worker from the claims table.

    Args:
        worker_id: e.g. 'W-3'
        status_filter: 'SENT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL' | None

    Returns:
        List of claim dicts, newest first.
    """
    conn = get_db_connection()

    if status_filter and status_filter.upper() not in ('ALL', ''):
        rows = conn.execute(
            "SELECT * FROM claims WHERE worker_id = ? AND status = ? ORDER BY created_at DESC",
            (worker_id, status_filter.upper())
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM claims WHERE worker_id = ? ORDER BY created_at DESC",
            (worker_id,)
        ).fetchall()

    conn.close()

    result = []
    for row in rows:
        d = dict(row)
        # Parse ai_reasoning_factors JSON if present
        if d.get('ai_reasoning_factors'):
            try:
                import json
                d['ai_reasoning_factors'] = json.loads(d['ai_reasoning_factors'])
            except Exception:
                d['ai_reasoning_factors'] = []
        # Normalise location as nested object for frontend consistency
        d['location'] = {
            'lat': d.get('location_lat', 0.0),
            'lng': d.get('location_lng', 0.0)
        }
        result.append(d)

    return result


def get_claim_by_id(claim_id):
    """Get a specific claim by ID."""
    conn = get_db_connection()
    
    claim = conn.execute("""
        SELECT * FROM claims WHERE claim_id = ?
    """, (claim_id,)).fetchone()
    
    conn.close()
    
    return dict(claim) if claim else None


def update_claim_status(claim_id, status, admin_notes=None):
    """Update claim status (admin action)."""
    try:
        conn = get_db_connection()
        
        conn.execute("""
            UPDATE claims 
            SET status = ?, admin_override_reason = ?, updated_at = ?
            WHERE claim_id = ?
        """, (status, admin_notes, datetime.utcnow().isoformat(), claim_id))
        
        conn.commit()
        conn.close()
        
        return {'success': True, 'message': 'Claim status updated'}
    except Exception as e:
        print(f"[CLAIM-UPDATE-STATUS-ERROR] {str(e)}")
        return {'success': False, 'message': str(e)}


if __name__ == '__main__':
    init_db()
    print("Database initialized successfully with mock data.")
