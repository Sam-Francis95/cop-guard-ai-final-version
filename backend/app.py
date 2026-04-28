import os
import json
import uuid
import queue
import threading
import requests
import jwt
import bcrypt
from functools import wraps
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
from dotenv import load_dotenv
load_dotenv()
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('JWT_SECRET', 'super-secret-copguard-key')

# Enable CORS for the frontend with proper configuration
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:5175", "http://localhost:5174", "http://127.0.0.1:5174", "http://localhost:5173"],
        "methods": ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True,
        "max_age": 3600
    }
})

@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        return '', 204

from db import (
    init_db, get_db_connection, subscribe_user, is_subscription_active,
    create_ai_claim, get_all_ai_claims, get_ai_claim_by_id, get_pending_ai_claims,
    update_ai_claim_status, get_claims_by_worker, upsert_worker_risk, get_worker_risk,
    check_duplicate_claim, register_user, get_user_by_phone, login_user
)
from premium_engine import calculate_premium
from claims_agent import process_worker_state_autonomously
from agentic_engine import process_worker_event, simulate_ai_trigger

# Initialize DB at startup
init_db()

# =====================================================================
# SSE REAL-TIME BROKER
# Server-Sent Events for instant Worker ↔ Admin claim synchronization
# =====================================================================

_sse_lock = threading.Lock()
_sse_subscribers: list[queue.Queue] = []   # one Queue per connected client


def sse_broadcast(event_type: str, data: dict):
    """Push an SSE event to every connected browser tab."""
    payload = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
    with _sse_lock:
        dead = []
        for q in _sse_subscribers:
            try:
                q.put_nowait(payload)
            except queue.Full:
                dead.append(q)
        for q in dead:
            _sse_subscribers.remove(q)


@app.route('/api/events', methods=['GET'])
def sse_stream():
    """
    Server-Sent Events stream.
    Frontend connects via:  new EventSource('/api/events', {withCredentials:true})
    Events emitted:
      - new_claim      → when any worker raises a claim
      - claim_updated  → when admin approves/rejects/holds a claim
      - heartbeat      → every 25s to keep connection alive
    """
    def generate():
        client_q: queue.Queue = queue.Queue(maxsize=50)
        with _sse_lock:
            _sse_subscribers.append(client_q)
        try:
            # Send initial connection confirmation
            yield "event: connected\ndata: {\"status\": \"ok\"}\n\n"
            while True:
                try:
                    msg = client_q.get(timeout=25)
                    yield msg
                except queue.Empty:
                    # Heartbeat keeps nginx/ALB from closing idle connections
                    yield ": heartbeat\n\n"
        except GeneratorExit:
            pass
        finally:
            with _sse_lock:
                if client_q in _sse_subscribers:
                    _sse_subscribers.remove(client_q)

    resp = Response(
        stream_with_context(generate()),
        mimetype='text/event-stream'
    )
    resp.headers['Cache-Control'] = 'no-cache'
    resp.headers['X-Accel-Buffering'] = 'no'
    resp.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
    resp.headers['Access-Control-Allow-Credentials'] = 'true'
    return resp


# MOCK_CLAIMS logic removed
claims_db = []

try:
    from anthropic import Anthropic
except ImportError:
    Anthropic = None

anthropic_client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY")) if Anthropic and os.getenv("ANTHROPIC_API_KEY") else None

@app.route('/api/debug/db-status', methods=['GET'])
def check_db_status():
    """Debug endpoint to check database status"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Check if users table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        users_table = cursor.fetchone() is not None
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_claims'")
        claims_table = cursor.fetchone() is not None
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='worker_risk_tracking'")
        risk_table = cursor.fetchone() is not None
        
        # Count users
        cursor.execute("SELECT COUNT(*) FROM users")
        user_count = cursor.fetchone()[0]
        
        conn.close()
        
        return jsonify({
            'status': 'ok',
            'tables': {
                'users': users_table,
                'ai_claims': claims_table,
                'worker_risk_tracking': risk_table
            },
            'user_count': user_count,
            'database_path': os.path.exists(os.path.join(os.path.dirname(__file__), 'users.db'))
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/insurance/subscribe', methods=['POST'])
def subscribe():
    data = request.json

    # Validate input (basic)
    if not all(k in data for k in ("name", "platform", "location")):
        return jsonify({"error": "Missing required fields"}), 400

    # 🔥 Step 0.5 → Premium calculation
    premium_data = calculate_premium(data["location"])

    # 🔥 Step 0 → Subscription
    user = subscribe_user(
        data["name"],
        data["platform"],
        data["location"]
    )

    return jsonify({
        "message": "User subscribed successfully",
        "user": user,
        "insurance": premium_data
    })

# =====================================================================
# AUTO DECISION ENGINE
# =====================================================================

def auto_decision_engine(risk_score, ai_confidence):
    """
    AI automatically decides claim approval status based on risk score.
    
    Decision Logic:
    - risk_score < 40: AUTO_APPROVED
    - 40 <= risk_score <= 75: PENDING (for review)
    - risk_score > 75: AUTO_REJECTED
    
    Args:
        risk_score: AI risk score (0-100)
        ai_confidence: AI confidence level (0-100) [for future use]
    
    Returns:
        Dict with status, decision_action, reason, and decided_at timestamp
    """
    decision = {
        'decided_at': datetime.utcnow().isoformat(),
        'risk_score': risk_score,
        'ai_confidence': ai_confidence
    }
    
    # Decision logic based on risk_score only
    if risk_score < 40:
        # Low risk → AUTO APPROVE
        decision['status'] = 'APPROVED'
        decision['decision_action'] = 'AUTO_APPROVED'
        decision['reason'] = f'Low risk score ({risk_score}) - Auto approved'
    
    elif 40 <= risk_score <= 75:
        # Medium risk → PENDING for review
        decision['status'] = 'PENDING'
        decision['decision_action'] = 'PENDING'
        decision['reason'] = f'Medium risk score ({risk_score}) - Requires review'
    
    else:
        # High risk (> 75) → AUTO REJECT
        decision['status'] = 'REJECTED'
        decision['decision_action'] = 'AUTO_REJECTED'
        decision['reason'] = f'High risk score ({risk_score}) - Auto rejected'
    
    print(f"[AUTO-DECISION] Status: {decision['status']}, Action: {decision['decision_action']}, Reason: {decision['reason']}")
    
    return decision

# =====================================================================
# AGENTIC AI ENGINE — CLAIM ANALYSIS & VERDICT GENERATION
# =====================================================================

def agentic_ai_analyze_claim(event_type, event_source, description):
    """
    Agentic AI analyzes claim and generates verdict with reasoning.
    
    Args:
        event_type: AUTO or MANUAL
        event_source: location, weather, network, activity, user
        description: claim description
    
    Returns:
        Dict with risk_score, risk_level, ai_confidence, verdict, summary, factors
    """
    import json
    import random
    
    # Base risk score accumulation
    risk_score = 20  # Base score for all claims
    factors = []
    
    # ===== RISK FACTOR ANALYSIS =====
    
    # 1. EVENT SOURCE RISK
    source_risks = {
        'location': {'max': 50, 'reason': 'Geographic hazard detected'},
        'weather': {'max': 40, 'reason': 'Weather alert present'},
        'network': {'max': 30, 'reason': 'Communication loss'},
        'activity': {'max': 35, 'reason': 'Behavioral anomaly'},
        'user': {'max': 25, 'reason': 'Manual report'}
    }
    
    if event_source in source_risks:
        source_risk = random.randint(source_risks[event_source]['max'] // 2, 
                                     source_risks[event_source]['max'])
        risk_score += source_risk
        factors.append({
            'factor': source_risks[event_source]['reason'],
            'impact': f'+{source_risk}'
        })
    
    # 2. DESCRIPTION KEYWORDS ANALYSIS
    keywords_risk = {
        'flood': 30, 'rain': 20, 'storm': 25, 'snow': 20,
        'heat': 25, 'cold': 20, 'fire': 35, 'crash': 40,
        'injury': 30, 'sick': 25, 'unsafe': 30, 'danger': 35,
        'lost': 35, 'stuck': 30, 'trapped': 40, 'help': 30
    }
    
    desc_lower = description.lower() if description else ""
    description_risk = 0
    
    for keyword, risk in keywords_risk.items():
        if keyword in desc_lower:
            keyword_risk = random.randint(risk // 2, risk)
            description_risk += keyword_risk
            factors.append({
                'factor': f'"{keyword}" detected in report',
                'impact': f'+{keyword_risk}'
            })
    
    risk_score += min(description_risk, 40)  # Cap description contribution
    
    # 3. EVENT TYPE CONTEXT
    if event_type == 'MANUAL':
        # Manual reports get slight boost as they're conscious decisions to report
        manual_risk = random.randint(5, 15)
        risk_score += manual_risk
        factors.append({
            'factor': 'Manual claim submission',
            'impact': f'+{manual_risk}'
        })
    
    # Cap risk score at 100
    risk_score = min(risk_score, 100)
    
    # ===== DETERMINE RISK LEVEL =====
    if risk_score < 40:
        risk_level = 'LOW'
    elif risk_score < 75:
        risk_level = 'MEDIUM'
    else:
        risk_level = 'HIGH'
    
    # ===== GENERATE AI CONFIDENCE =====
    # Higher confidence for extreme scores, lower for middle range
    if risk_score < 30 or risk_score > 85:
        confidence = random.uniform(0.85, 0.98)
    else:
        confidence = random.uniform(0.70, 0.85)
    
    # ===== GENERATE VERDICT =====
    # Logic: risk_score < 40 → REJECTED, 40-75 → PENDING, >75 → APPROVED
    if risk_score < 40:
        verdict = 'REJECTED'
        summary = f'Risk assessment indicates low-risk situation ({risk_score}/100). Claim recommended for rejection.'
    elif risk_score <= 75:
        verdict = 'PENDING'
        summary = f'Risk assessment indicates medium-risk situation ({risk_score}/100). Requires manual review to determine claim eligibility.'
    else:
        verdict = 'APPROVED'
        summary = f'Risk assessment indicates high-risk situation ({risk_score}/100). Claim recommended for approval to ensure worker safety.'
    
    return {
        'risk_score': risk_score,
        'risk_level': risk_level,
        'ai_confidence': round(confidence, 3),
        'ai_verdict': verdict,
        'ai_reasoning_summary': summary,
        'ai_reasoning_factors': factors
    }

# =====================================================================
# EXPLAINABLE AI (XAI) ENGINE
# =====================================================================

RISK_FACTORS_POOL = [
    {
        'name': 'No Movement',
        'description': 'Worker inactive for extended period',
        'impact_range': (20, 35)
    },
    {
        'name': 'Unsafe Zone Entry',
        'description': 'Entered restricted or high-risk area',
        'impact_range': (35, 50)
    },
    {
        'name': 'Abnormal Pattern',
        'description': 'Irregular movement or behavior detected',
        'impact_range': (15, 25)
    },
    {
        'name': 'Lone Working',
        'description': 'Extended lone working without contact',
        'impact_range': (15, 30)
    },
    {
        'name': 'Silent Alarm',
        'description': 'Worker not responding to safety check-ins',
        'impact_range': (25, 40)
    },
    {
        'name': 'Environmental Hazard',
        'description': 'Hazardous environment conditions detected',
        'impact_range': (20, 35)
    },
    {
        'name': 'Vital Signs Alert',
        'description': 'Abnormal vital readings via sensors',
        'impact_range': (30, 45)
    },
    {
        'name': 'Rapid Location Change',
        'description': 'Sudden unexpected movement detected',
        'impact_range': (15, 25)
    }
]

def generate_xai_explanation(risk_score, selected_reasons=None):
    """
    Generate explainable AI explanation for a claim.
    
    Args:
        risk_score: Total risk score (0-100)
        selected_reasons: List of reason strings (optional)
    
    Returns:
        Dict with 'factors' list and 'final_reason' string
    """
    import random
    
    # Select 2-3 factors to explain the risk score
    num_factors = random.randint(2, 3)
    selected_factors = random.sample(RISK_FACTORS_POOL, k=num_factors)
    
    factors = []
    total_impact = 0
    
    for factor in selected_factors:
        min_impact, max_impact = factor['impact_range']
        # Adjust impact based on risk_score distribution
        impact = random.randint(min_impact, max_impact)
        total_impact += impact
        
        factors.append({
            'name': factor['name'],
            'description': factor['description'],
            'impact': impact,
            'severity': 'high' if impact >= 35 else 'medium' if impact >= 20 else 'low'
        })
    
    # Sort by impact (highest first)
    factors.sort(key=lambda x: x['impact'], reverse=True)
    
    # Normalize impacts to match risk_score if needed
    if total_impact != 0:
        scale = risk_score / total_impact
        for factor in factors:
            factor['impact'] = round(factor['impact'] * scale)
        # Ensure sum equals risk_score
        diff = risk_score - sum(f['impact'] for f in factors)
        if diff != 0 and factors:
            factors[0]['impact'] += diff
    
    # Build final reason
    factor_reasons = []
    for f in factors[:2]:  # Use top 2 factors
        factor_reasons.append(f.get('description', f['name']))
    
    final_reason = f"High risk due to {' and '.join(factor_reasons).lower()}"
    
    return {
        'factors': factors,
        'final_reason': final_reason,
        'risk_score': risk_score
    }

def enrich_claims(claims_list):
    if not claims_list:
        return []
        
    conn = get_db_connection()
    # Since we simplified the schema to just workers (no role column), we fetch all users
    # And map 'name' back to 'full_name' and 'phone' to 'phone_number' for frontend compatibility
    users = conn.execute("SELECT id, name as full_name, age, phone as phone_number, created_at FROM users").fetchall()
    conn.close()
    
    user_map = {f"W-{u['id']}": dict(u) for u in users}
    
    enriched = []
    for c in claims_list:
        cc = dict(c)
        u_info = user_map.get(cc['worker_id'], {})
        cc['worker_name'] = u_info.get('full_name', 'Unknown Worker')
        cc['worker_age'] = u_info.get('age', 'N/A')
        cc['worker_phone'] = u_info.get('phone_number', 'N/A')
        cc['worker_registered_at'] = u_info.get('created_at', 'N/A')
        
        # Parse explanation from detection_signals if it exists
        try:
            if cc.get('detection_signals'):
                signals = json.loads(cc['detection_signals'])
                cc['explanation'] = signals.get('explanation', {})
        except:
            pass
        
        enriched.append(cc)
    
    return enriched

def create_ai_claim(user_id, worker_id, location_lat, location_lng, reason, 
                   distress_condition, ai_confidence, detection_signals, 
                   risk_score=None, risk_level='HIGH'):
    """
    Creates an AI-generated insurance claim in the database with XAI explanation.
    
    Args:
        user_id: User ID of the worker
        worker_id: Worker ID string (e.g., "W-1")
        location_lat: Claim location latitude
        location_lng: Claim location longitude
        reason: Human-readable reason for the claim
        distress_condition: Type of distress detected
        ai_confidence: AI confidence level (0-100)
        detection_signals: JSON string of detection signals
        risk_score: Risk score (0-100)
        risk_level: Risk level (LOW, MEDIUM, HIGH)
    
    Returns:
        Dict with claim_id, status, source, ai_confidence, and explanation
    """
    try:
        # Generate unique claim ID: AIC-{timestamp}{random}
        import time
        timestamp = str(int(time.time() * 1000))[-10:]  # Last 10 digits of milliseconds
        random_suffix = ''.join([str(random.randint(0, 9)) for _ in range(8)])
        claim_id = f"AIC-{timestamp}{random_suffix}"
        
        # Generate XAI explanation
        xai_explanation = generate_xai_explanation(risk_score)
        
        # Merge explanation into detection_signals
        try:
            signals_dict = json.loads(detection_signals) if isinstance(detection_signals, str) else detection_signals
        except:
            signals_dict = {}
        
        signals_dict['explanation'] = xai_explanation
        detection_signals_json = json.dumps(signals_dict)
        
        conn = get_db_connection()
        
        # Apply auto-decision engine
        decision = auto_decision_engine(risk_score, ai_confidence)
        
        # Insert claim into database with auto-decision
        conn.execute("""
            INSERT INTO ai_claims 
            (claim_id, user_id, worker_id, location_lat, location_lng, reason, 
             distress_condition, ai_confidence, risk_score, risk_level, status, 
             source, detection_signals, timestamp, created_at, updated_at,
             decision_type, decision_action, decided_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            claim_id, user_id, worker_id, location_lat, location_lng, reason,
            distress_condition, ai_confidence, risk_score, risk_level, decision['status'],
            'AI_GENERATED', detection_signals_json, 
            datetime.utcnow().isoformat(), 
            datetime.utcnow().isoformat(),
            datetime.utcnow().isoformat(),
            'AUTO', decision['decision_action'], decision['decided_at']
        ))
        
        conn.commit()
        conn.close()
        
        print(f"[AUTO-DECISION] Created {claim_id} for {worker_id} | Status: {decision['status']} | Action: {decision['decision_action']}")
        
        return {
            'claim_id': claim_id,
            'status': decision['status'],
            'source': 'AI_GENERATED',
            'ai_confidence': ai_confidence,
            'risk_score': risk_score,
            'risk_level': risk_level,
            'explanation': xai_explanation,
            'decision_type': 'AUTO',
            'decision_action': decision['decision_action'],
            'decided_at': decision['decided_at']
        }
    
    except Exception as e:
        print(f"[CREATE-AI-CLAIM-ERROR] Failed to create claim: {str(e)}")
        raise

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.method == 'OPTIONS':
            return '', 204
        token = None
        if 'Authorization' in request.headers:
            token = request.headers['Authorization'].split(" ")[1]
        if not token:
            return jsonify({'message': 'Token is missing!'}), 401
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user_id = data.get('id')
            # Support both old 'role' and new 'phone' based tokens
            current_user_role = data.get('role', 'worker')
            current_user_phone = data.get('phone', '')
        except Exception as e:
            return jsonify({'message': 'Token is invalid!'}), 401
        
        # Pass phone if it exists in token, otherwise pass role
        if current_user_phone:
            return f(current_user_id, current_user_phone, *args, **kwargs)
        else:
            return f(current_user_id, current_user_role, *args, **kwargs)
    return decorated


@app.route('/api/auth/admin/login', methods=['POST'])
def admin_login():
    """Admin login - using hardcoded credentials"""
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    # Hardcoded admin credentials
    if email == 'admin@copguard.com' and password == 'Admin@123':
        token = jwt.encode({
            'id': 999,
            'email': email,
            'role': 'admin',
            'exp': datetime.utcnow() + timedelta(days=1)
        }, app.config['SECRET_KEY'], algorithm="HS256")
        return jsonify({'status': 'success', 'token': token, 'role': 'admin'})
    
    return jsonify({'status': 'error', 'message': 'Invalid credentials'}), 401

@app.route('/api/auth/register', methods=['POST', 'OPTIONS'])
def register():
    """
    Register a new worker
    Input: { name, age, phone, password }
    Output: { status, message, user_id }
    """
    # Handle preflight requests
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        data = request.json
        if not data:
            return jsonify({'status': 'error', 'message': 'No data provided'}), 400
        
        name = data.get('name', '').strip()
        age = data.get('age')
        phone = str(data.get('phone', '')).strip()
        password = data.get('password', '').strip()
        
        # Validate inputs
        if not name:
            return jsonify({'status': 'error', 'message': 'Name is required'}), 400
        
        if not password or len(password) < 6:
            return jsonify({'status': 'error', 'message': 'Password must be at least 6 characters'}), 400
        
        try:
            age_int = int(age)
            if age_int < 1 or age_int > 120:
                return jsonify({'status': 'error', 'message': 'Please enter a valid age'}), 400
        except (ValueError, TypeError):
            return jsonify({'status': 'error', 'message': 'Age must be a number'}), 400
        
        phone_digits = ''.join(filter(str.isdigit, phone))
        if len(phone_digits) != 10:
            return jsonify({'status': 'error', 'message': 'Phone number must be exactly 10 digits'}), 400
        
        # Hash password
        hashed_pw = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        # Register user
        result = register_user(name, age_int, phone_digits, hashed_pw)

        if result['success']:
            print(f"[REGISTER] User registered: {name} ({phone_digits})")
            
            # Generate token for auto-login
            token = jwt.encode({
                'id': result['user_id'],
                'phone': phone_digits,
                'role': 'worker',
                'exp': datetime.utcnow() + timedelta(days=7)
            }, app.config['SECRET_KEY'], algorithm="HS256")
            
            return jsonify({
                'status': 'success',
                'message': 'Registration successful',
                'token': token,
                'user': {
                    'id': result['user_id'],
                    'name': name,
                    'age': age_int,
                    'phone': phone_digits,
                    'role': 'worker'
                }
            }), 201
        else:
            return jsonify({
                'status': 'error',
                'message': result['message']
            }), 400
    
    except Exception as e:
        error_msg = str(e)
        print(f"[REGISTER-ERROR] {error_msg}")
        return jsonify({'status': 'error', 'message': f'Registration error: {error_msg}'}), 500


@app.route('/api/auth/login', methods=['POST', 'OPTIONS'])
def login():
    """
    Login a worker
    Input: { phone, password }
    Output: { status, token, user, message }
    """
    # Handle preflight requests
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        data = request.json
        phone = str(data.get('phone', '')).strip()
        password = data.get('password', '').strip()
        
        if not phone or not password:
            return jsonify({'status': 'error', 'message': 'Phone and password are required'}), 400
        
        phone_digits = ''.join(filter(str.isdigit, phone))
        
        # Login user
        result = login_user(phone_digits, password)
        
        if result['success']:
            token = jwt.encode({
                'id': result['user']['id'],
                'phone': result['user']['phone'],
                'exp': datetime.utcnow() + timedelta(days=7)
            }, app.config['SECRET_KEY'], algorithm="HS256")
            
            print(f"[LOGIN] User logged in: {result['user']['phone']}")
            return jsonify({
                'status': 'success',
                'token': token,
                'user': result['user'],
                'message': result['message']
            }), 200
        else:
            return jsonify({
                'status': 'error',
                'message': result['message']
            }), 401
    
    except Exception as e:
        error_msg = str(e)
        print(f"[LOGIN-ERROR] {error_msg}")
        return jsonify({'status': 'error', 'message': f'Login error: {error_msg}'}), 500


@app.route('/api/auth/worker/login', methods=['POST'])
def worker_login():
    """Legacy endpoint - calls new login"""
    return login()


@app.route('/api/auth/worker/register', methods=['POST'])
def worker_register():
    """Legacy endpoint - calls new register"""
    return register()

@app.route('/api/auth/me', methods=['GET'])
@token_required
def get_me(user_id, phone):
    try:
        conn = get_db_connection()
        user = conn.execute("SELECT id, name, age, phone FROM users WHERE id = ?", (user_id,)).fetchone()
        conn.close()
        
        if not user:
            return jsonify({'status': 'error', 'message': 'User not found'}), 404
        
        return jsonify({
            'status': 'success',
            'user': {
                'id': user[0],
                'name': user[1],
                'age': user[2],
                'phone': user[3]
            }
        }), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/workers/locations', methods=['GET'])
@token_required
def get_worker_locations(user_id, role):
    if role != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin access required'}), 403

    conn = get_db_connection()
    workers = conn.execute("SELECT id, name as full_name, age, phone as phone_number, last_location_lat, last_location_lon, last_seen FROM users").fetchall()
    conn.close()

    locations = []
    for w in workers:
        w_dict = dict(w)
        raw_w_id = str(w_dict['id'])
        w_id = f"W-{w_dict['id']}"
        
        # Check if worker is actively simulated
        active = ACTIVE_WORKERS.get(raw_w_id)
        if active:
            lat = active['route']['current_lat']
            lng = active['route']['current_lng']
        else:
            lat = w_dict['last_location_lat']
            lng = w_dict['last_location_lon']
            
        # Provide default location for workers without GPS data yet
        if not lat or not lng:
            lat = 20.5937  # Center of India
            lng = 78.9629

        fraud_score = 0
        verdict = 'low'
        
        # Get AI score if available from trigger check
        ai_data = TRIGGERED_EVENTS.get(raw_w_id)
        if ai_data and 'ai_result' in ai_data:
            fraud_score = ai_data['ai_result'].get('fraud_score', 0)
            verdict = ai_data['ai_result'].get('verdict', 'low')

        locations.append({
            'worker_id': w_id,
            'full_name': w_dict['full_name'],
            'age': w_dict['age'],
            'phone_number': w_dict['phone_number'],
            'gps': {'lat': lat, 'lng': lng},
            'last_seen': w_dict['last_seen'],
            'fraud_score': fraud_score,
            'verdict': verdict
        })
        
    return jsonify({'status': 'success', 'workers': locations})

@app.route('/api/auth/update-location', methods=['POST', 'OPTIONS'])
@token_required
def update_location(user_id, role):
    data = request.json
    lat = data.get('lat')
    lon = data.get('lng') if 'lng' in data else data.get('lon')
    
    conn = get_db_connection()
    conn.execute("UPDATE users SET last_location_lat = ?, last_location_lon = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?", (lat, lon, user_id))
    conn.commit()
    conn.close()
    
    return jsonify({'status': 'success'})

@app.route('/api/claims/my', methods=['GET', 'OPTIONS'])
@token_required
def get_my_claims(user_id, role):
    target_w_id = f"W-{user_id}"
    my_claims = [c for c in claims_db if c["worker_id"] == target_w_id]
    
    # If the worker has no mock claims, generate one on the fly so they have a baseline
    if not my_claims:
        from mock_data import build_dynamic_claim, INDIAN_CITIES
        import random
        from datetime import datetime
        new_claim = build_dynamic_claim("genuine", datetime.utcnow(), 0, random.choice(INDIAN_CITIES))
        new_claim["worker_id"] = target_w_id
        claims_db.insert(0, new_claim)
        my_claims = [new_claim]
        
    return jsonify(enrich_claims(my_claims))


# NOTE: GET /api/claims is now handled by get_all_claims_endpoint (defined below ~line 1520+).
# That version queries the real `claims` SQLite table and supports ?worker_id= and ?status= filters.


@app.route('/api/claims/<id>', methods=['GET'])
@token_required
def get_single_claim(user_id, role, id):
    claim = next((c for c in claims_db if c["id"] == id), None)
    if not claim:
        return jsonify({"status": "error", "message": "Claim not found."}), 404
    return jsonify(enrich_claims([claim])[0])

@app.route('/api/syndicate', methods=['GET'])
@token_required
def get_syndicate_clusters(user_id, role):
    groups = {}
    for c in claims_db:
        key = f"{c['gps_coords']['lat']:.3f},{c['gps_coords']['lng']:.3f}"
        if key not in groups:
            groups[key] = []
        groups[key].append(c)
    
    syndicate_clusters = []
    for loc, arr in groups.items():
        if len(arr) < 5:
            continue
        
        # Sort claims by timestamp
        arr.sort(key=lambda x: x['timestamp'])
        
        # Find 5+ claims within 3 mins (180 seconds)
        from datetime import datetime
        cluster_found = False
        for i in range(len(arr) - 4):
            t1 = datetime.fromisoformat(arr[i]['timestamp'].replace("Z", "+00:00"))
            t5 = datetime.fromisoformat(arr[i+4]['timestamp'].replace("Z", "+00:00"))
            if (t5 - t1).total_seconds() <= 180:
                cluster_found = True
                break
        
        if cluster_found:
            syndicate_clusters.append([loc, enrich_claims(arr)])
            
    return jsonify(syndicate_clusters)

# ── Cell Tower Network Data ─────────────────────────────────────────────────
import math

OPERATORS = ['Jio', 'Airtel', 'Vi', 'BSNL']
FREQUENCIES = ['850 MHz', '900 MHz', '1800 MHz', '2100 MHz', '2300 MHz', '2500 MHz']

def _generate_towers_for_city(city_name, city_lat, city_lon, count, op_weights):
    """Generate realistic tower positions scattered around a city center."""
    import random
    random.seed(int(city_lat * 1000 + city_lon * 1000))  # deterministic per city
    towers = []
    for i in range(count):
        # Scatter towers within ~20km radius
        dlat = (random.random() - 0.5) * 0.36
        dlng = (random.random() - 0.5) * 0.36
        op_idx = random.choices(range(len(OPERATORS)), weights=op_weights)[0]
        towers.append({
            'id': f"T{int(city_lat*10):04d}{int(city_lon*10):04d}{i:03d}",
            'lat': round(city_lat + dlat, 5),
            'lng': round(city_lon + dlng, 5),
            'operator': OPERATORS[op_idx],
            'frequency': random.choice(FREQUENCIES),
            'mcc': 404,
            'mnc': [1, 10, 20, 5][op_idx],
        })
    return towers

# Pre-build the tower dataset at startup
_TOWER_DATASET = []
_CITY_TOWER_CONFIGS = [
    # (name, lat, lon, count, [Jio%, Airtel%, Vi%, BSNL%])
    ("Mumbai",     19.0760, 72.8777, 28, [35, 30, 25, 10]),
    ("Delhi",      28.6139, 77.2090, 30, [33, 32, 22, 13]),
    ("Bangalore",  12.9716, 77.5946, 26, [36, 31, 23, 10]),
    ("Chennai",    13.0827, 80.2707, 24, [34, 29, 24, 13]),
    ("Hyderabad",  17.3850, 78.4867, 22, [35, 30, 20, 15]),
    ("Kolkata",    22.5726, 88.3639, 20, [32, 28, 22, 18]),
    ("Pune",       18.5204, 73.8567, 18, [36, 30, 22, 12]),
    ("Ahmedabad",  23.0225, 72.5714, 16, [34, 31, 20, 15]),
    ("Jaipur",     26.9124, 75.7873, 14, [33, 28, 20, 19]),
    ("Surat",      21.1702, 72.8311, 12, [35, 30, 20, 15]),
    ("Lucknow",    26.8467, 80.9462, 12, [32, 27, 18, 23]),
    ("Patna",      25.5941, 85.1376, 10, [30, 25, 15, 30]),
    ("Bhopal",     23.2599, 77.4126, 10, [33, 28, 20, 19]),
    ("Nagpur",     21.1458, 79.0882, 10, [34, 29, 20, 17]),
    ("Coimbatore", 11.0168, 76.9558,  8, [35, 30, 22, 13]),
    ("Kochi",       9.9312, 76.2673,  8, [34, 29, 22, 15]),
    ("Visakhapatnam",17.6868,83.2185, 8, [33, 28, 18, 21]),
    ("Indore",     22.7196, 75.8577,  8, [34, 29, 20, 17]),
    ("Bhubaneswar",20.2961, 85.8189,  6, [31, 26, 16, 27]),
    ("Chandigarh", 30.7333, 76.7794,  6, [33, 30, 18, 19]),
]

for cfg in _CITY_TOWER_CONFIGS:
    _TOWER_DATASET.extend(_generate_towers_for_city(*cfg))

def _haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.asin(math.sqrt(a))

@app.route('/api/network/towers', methods=['GET'])
@token_required
def get_network_towers(user_id, role):
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    radius = request.args.get('radius', default=500, type=int)

    # Return all towers for map rendering (no lat/lon = full dataset)
    if lat is None or lon is None:
        return jsonify({'status': 'success', 'towers': _TOWER_DATASET, 'total': len(_TOWER_DATASET)})

    # Filter by radius
    nearby = [
        t for t in _TOWER_DATASET
        if _haversine_m(lat, lon, t['lat'], t['lng']) <= radius
    ]
    op_counts = {}
    for t in nearby:
        op_counts[t['operator']] = op_counts.get(t['operator'], 0) + 1
    dominant_op = max(op_counts, key=op_counts.get) if op_counts else 'None'

    coverage = 'strong' if len(nearby) >= 5 else 'medium' if len(nearby) >= 2 else 'weak'

    return jsonify({
        'status': 'success',
        'count': len(nearby),
        'dominant_operator': dominant_op,
        'coverage': coverage,
        'operator_breakdown': op_counts,
        'towers': nearby
    })

# ── Weather cache (5-min TTL) ──────────────────────────────────────────────
_weather_cache = {}  # key: str  →  { 'data': ..., 'ts': float }
WEATHER_TTL = 300    # 5 minutes

STORM_CONDITIONS = {'thunderstorm', 'tornado', 'squall', 'drizzle', 'heavy intensity rain',
                    'very heavy rain', 'extreme rain', 'heavy snow', 'heavy shower rain'}

def _is_storm(condition: str) -> bool:
    c = condition.lower()
    return any(s in c for s in STORM_CONDITIONS)

def _fetch_owm_weather(lat, lon, api_key):
    url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={api_key}"
    res = requests.get(url, timeout=6)
    d = res.json()
    condition = d['weather'][0]['main']
    description = d['weather'][0]['description'].title()
    icon = d['weather'][0]['icon']
    temp = round(d['main']['temp'] - 273.15, 1)
    wind_kph = round(d['wind']['speed'] * 3.6, 1)
    humidity = d['main']['humidity']
    return {
        'condition': condition,
        'description': description,
        'icon': icon,
        'temp_c': temp,
        'wind_kph': wind_kph,
        'humidity': humidity,
        'is_storm': _is_storm(condition) or _is_storm(description),
        'summary': f"{description}, {temp}°C, Wind {wind_kph} km/h, Humidity {humidity}%"
    }

@app.route('/api/weather/<lat>/<lon>', methods=['GET'])
@token_required
def get_weather(user_id, role, lat, lon):
    import time
    api_key = os.getenv("OPENWEATHERMAP_API_KEY")
    if not api_key or api_key == "YOUR_OPENWEATHERMAP_API_KEY_HERE":
        return jsonify({"status": "success", "data": f"Clear skies, 24°C. (Mocked for {lat}, {lon})",
                        "condition": "Clear", "temp_c": 24, "wind_kph": 10, "humidity": 40, "is_storm": False,
                        "icon": "01d", "description": "Clear Sky"})
    cache_key = f"{float(lat):.3f},{float(lon):.3f}"
    cached = _weather_cache.get(cache_key)
    if cached and (time.time() - cached['ts']) < WEATHER_TTL:
        return jsonify({"status": "success", **cached['data']})
    try:
        w = _fetch_owm_weather(lat, lon, api_key)
        _weather_cache[cache_key] = {'data': w, 'ts': time.time()}
        return jsonify({"status": "success", **w})
    except Exception as e:
        return jsonify({"status": "success", "data": "Weather data unavailable", "is_storm": False})

INDIAN_MAJOR_CITIES = [
    {"name": "Chennai",    "lat": 13.0827, "lon": 80.2707},
    {"name": "Mumbai",     "lat": 19.0760, "lon": 72.8777},
    {"name": "Delhi",      "lat": 28.6139, "lon": 77.2090},
    {"name": "Bangalore",  "lat": 12.9716, "lon": 77.5946},
    {"name": "Hyderabad",  "lat": 17.3850, "lon": 78.4867},
    {"name": "Kolkata",    "lat": 22.5726, "lon": 88.3639},
    {"name": "Pune",       "lat": 18.5204, "lon": 73.8567},
]

_cities_cache = {'data': None, 'ts': 0}

@app.route('/api/weather/cities', methods=['GET'])
@token_required
def get_city_weather(user_id, role):
    import time
    api_key = os.getenv("OPENWEATHERMAP_API_KEY")
    now = time.time()
    if _cities_cache['data'] and (now - _cities_cache['ts']) < WEATHER_TTL:
        return jsonify({"status": "success", "cities": _cities_cache['data']})

    results = []
    for city in INDIAN_MAJOR_CITIES:
        entry = dict(city)
        if not api_key or api_key == "YOUR_OPENWEATHERMAP_API_KEY_HERE":
            # Realistic mock data
            entry.update({'condition': 'Clear', 'description': 'Clear Sky', 'icon': '01d',
                          'temp_c': 28, 'wind_kph': 12, 'humidity': 55, 'is_storm': False,
                          'summary': 'Clear Sky, 28°C'})
        else:
            try:
                entry.update(_fetch_owm_weather(city['lat'], city['lon'], api_key))
            except Exception:
                entry.update({'condition': 'Unknown', 'description': 'Unavailable', 'icon': '01d',
                              'temp_c': 0, 'wind_kph': 0, 'humidity': 0, 'is_storm': False,
                              'summary': 'Data unavailable'})
        results.append(entry)

    _cities_cache['data'] = results
    _cities_cache['ts'] = now
    return jsonify({"status": "success", "cities": results})

@app.route('/api/analyse/<id>', methods=['POST'])
@token_required
def analyze_existing_claim(user_id, role, id):
    claim = next((c for c in claims_db if c["id"] == id), None)
    
    if not claim:
        return jsonify({"status": "error", "message": "Claim not found."}), 404

    # CHANGE 7: Attach worker's real GPS coordinates from database 
    conn = get_db_connection()
    try:
        w_id = int(claim['worker_id'].replace('W-', ''))
        db_user = conn.execute("SELECT last_location_lat, last_location_lon FROM users WHERE id = ?", (w_id,)).fetchone()
        if db_user and db_user['last_location_lat'] is not None:
            claim['gps_coords']['lat'] = db_user['last_location_lat']
            claim['gps_coords']['lng'] = db_user['last_location_lon']
    except Exception as em:
        pass
    finally:
        conn.close()

    # Fetch weather for context just before analysis
    api_key = os.getenv("OPENWEATHERMAP_API_KEY")
    if api_key and api_key != "YOUR_OPENWEATHERMAP_API_KEY_HERE":
        try:
            url = f"https://api.openweathermap.org/data/2.5/weather?lat={claim['gps_coords']['lat']}&lon={claim['gps_coords']['lng']}&appid={api_key}"
            res = requests.get(url, timeout=5)
            data = res.json()
            weather_desc = data['weather'][0]['description'].title()
            claim["environment"]["weather_api_data"] = f"{weather_desc}, {round(data['main']['temp'] - 273.15, 1)}°C"
        except:
            pass

    # Run Gap Finder AI logic
    analysis = run_gap_finder_ai(claim)
    claim["gap_finder"] = analysis
    
    return jsonify({"status": "success", "claim": enrich_claims([claim])[0]})


# =====================================================================
# FEATURE 1 & 2: Worker Active State & Route Simulation Engine
# =====================================================================
import random

# In-memory dictionary to track active workers and their mock routes
# Structure: { user_id_str: { "status": "active", "route": {...} } }
ACTIVE_WORKERS = {}

@app.route('/api/worker/activate', methods=['POST'])
def activate_worker():
    """FEATURE 1: Worker Activation Engine"""
    data = request.json
    user_id = str(data.get("user_id"))
    pickup = data.get("pickup_location", "Unknown Pickup")
    drop = data.get("drop_location", "Unknown Drop")

    if not user_id:
        return jsonify({"error": "User ID is required"}), 400

    # Generate a simulated route for the worker
    route = {
        "pickup": pickup,
        "drop": drop,
        "distance_km": round(random.uniform(2.0, 10.0), 1),
        "eta_minutes": random.randint(10, 30),
        "start_time": datetime.utcnow().isoformat(),
        "status": "ongoing",
        # Base origin point for simulation later
        "current_lat": 13.0827 + random.uniform(-0.02, 0.02),  # Base: Chennai
        "current_lng": 80.2707 + random.uniform(-0.02, 0.02)
    }

    # Store active state
    ACTIVE_WORKERS[user_id] = {
        "status": "active",
        "route": route
    }

    return jsonify({
        "message": "Worker activated successfully",
        "worker_state": ACTIVE_WORKERS[user_id]
    }), 200

@app.route('/api/worker/status/<user_id>', methods=['GET'])
def get_worker_status(user_id):
    """FEATURE 3: Worker Status API (Enhanced with Feature 1)"""
    user_id = str(user_id)
    
    if user_id in ACTIVE_WORKERS:
        state = ACTIVE_WORKERS[user_id]
        
        # FEATURE 1: Check if trigger exists
        trigger_info = {"active": False}
        if user_id in TRIGGERED_EVENTS:
            evt = TRIGGERED_EVENTS[user_id]
            trigger_info = {
                "active": True,
                "event": evt["event"],
                "condition": evt["condition"],
                "severity": evt["severity"]
            }

        return jsonify({
            "status": state["status"],
            "route": {
                "pickup": state["route"]["pickup"],
                "drop": state["route"]["drop"],
                "distance_km": state["route"]["distance_km"],
                "eta_minutes": state["route"]["eta_minutes"],
                "status": state["route"]["status"]
            },
            "trigger": trigger_info
        }), 200
    
    # Not active
    return jsonify({"status": "idle", "trigger": {"active": False}}), 200

# =====================================================================
# WORKER STATE TRACKING FOR AUTONOMOUS AGENT
# =====================================================================

# Track worker history for movement and inactivity calculations
WORKER_STATE = {}  # { user_id: { "prev_lat", "prev_lng", "last_update", "inactivity_start", ... } }

@app.route('/api/worker/location/<user_id>', methods=['GET'])
def get_worker_location(user_id):
    """FEATURE 4: Worker Location Simulation with Agentic AI Claims Processing"""
    user_id = str(user_id)
    
    if user_id not in ACTIVE_WORKERS:
        return jsonify({"error": "Worker not active or not found"}), 404

    state = ACTIVE_WORKERS[user_id]
    route = state["route"]

    # Simulate minor movement on every poll
    delta_lat = random.uniform(-0.0005, 0.0005)
    delta_lng = random.uniform(-0.0005, 0.0005)
    
    route["current_lat"] += delta_lat
    route["current_lng"] += delta_lng
    
    curr_lat = round(route["current_lat"], 5)
    curr_lng = round(route["current_lng"], 5)

    # ════════════════════════════════════════════════════════════════
    # AGENTIC AI: AUTONOMOUS CLAIM PROCESSING
    # ════════════════════════════════════════════════════════════════
    
    # Initialize worker state if not present
    if user_id not in WORKER_STATE:
        WORKER_STATE[user_id] = {
            "prev_lat": curr_lat,
            "prev_lng": curr_lng,
            "last_update": datetime.utcnow(),
            "prev_update": datetime.utcnow(),
            "inactivity_start": None
        }
    
    worker_state_record = WORKER_STATE[user_id]
    now = datetime.utcnow()
    time_delta = (now - worker_state_record["last_update"]).total_seconds()
    
    # Calculate movement metrics
    import math
    lat_diff = curr_lat - worker_state_record["prev_lat"]
    lng_diff = curr_lng - worker_state_record["prev_lng"]
    distance_m = _haversine_m(
        worker_state_record["prev_lat"], 
        worker_state_record["prev_lng"],
        curr_lat, 
        curr_lng
    )
    
    # Calculate inactivity
    if distance_m < 10:  # Less than 10m movement
        if worker_state_record["inactivity_start"] is None:
            worker_state_record["inactivity_start"] = now
        inactivity_minutes = (now - worker_state_record["inactivity_start"]).total_seconds() / 60
    else:
        worker_state_record["inactivity_start"] = None
        inactivity_minutes = 0
    
    # Update state
    worker_state_record["prev_lat"] = curr_lat
    worker_state_record["prev_lng"] = curr_lng
    worker_state_record["prev_update"] = worker_state_record["last_update"]
    worker_state_record["last_update"] = now
    
    # Prepare data for agentic processing
    movement_data = {
        "distance_traveled_m": distance_m,
        "duration_seconds": time_delta,
        "speed_kmh": (distance_m / max(time_delta, 1)) * 3.6
    }
    
    # Fetch weather data for current location
    weather_data = None
    try:
        api_key = os.getenv("OPENWEATHERMAP_API_KEY")
        if api_key and api_key != "YOUR_OPENWEATHERMAP_API_KEY_HERE":
            url = f"https://api.openweathermap.org/data/2.5/weather?lat={curr_lat}&lon={curr_lng}&appid={api_key}"
            res = requests.get(url, timeout=5)
            w = res.json()
            weather_data = {
                "condition": w.get('weather', [{}])[0].get('main', 'Unknown'),
                "description": w.get('weather', [{}])[0].get('description', 'Unknown'),
                "temp_c": round(w.get('main', {}).get('temp', 0) - 273.15, 1),
                "is_storm": any(
                    keyword in str(w.get('weather', [{}])[0].get('main', '')).lower()
                    for keyword in ['thunderstorm', 'tornado', 'rain', 'snow']
                )
            }
    except Exception as e:
        print(f"[WEATHER FETCH] Error for worker {user_id}: {e}")
    
    # Get actual user_id from database to link to worker
    try:
        actual_user_id = int(user_id) if user_id.isdigit() else None
    except:
        actual_user_id = None
    
    # Process autonomous claim if conditions warrant it
    agent_result = None
    claim_triggered = False
    
    if actual_user_id:
        try:
            agent_result = process_worker_state_autonomously(
                worker_id=f"W-{user_id}",
                user_id=actual_user_id,
                location=(curr_lat, curr_lng),
                movement_data=movement_data,
                weather_data=weather_data,
                inactivity_minutes=inactivity_minutes
            )
            
            claim_triggered = agent_result.get("claim_triggered", False)
            
            if claim_triggered:
                print(f"[AUTONOMOUS CLAIM] Generated for worker {user_id}: {agent_result.get('claim_id')}")
                print(f"  Signals: {agent_result.get('signals')}")
                print(f"  Confidence: {agent_result.get('confidence')}%")
        
        except Exception as e:
            print(f"[AGENT ERROR] Processing worker {user_id}: {e}")

    # FEATURE 2: Auto Trigger Check Hook (existing rain-based system)
    trigger_flag = False
    condition_str = "clear"

    # FEATURE 5: Ensure Idempotency (Don't check if already triggered)
    if user_id in TRIGGERED_EVENTS:
        trigger_flag = True
        condition_str = TRIGGERED_EVENTS[user_id]["condition"]
    else:
        # Run detection
        risk = detect_rain_risk(curr_lat, curr_lng)
        if risk["trigger"]:
            # Store event in TRIGGERED_EVENTS
            TRIGGERED_EVENTS[user_id] = {
                "event": "rain_trigger",
                "condition": risk["condition"],
                "severity": risk["severity"],
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "location": {"lat": curr_lat, "lng": curr_lng}
            }
            trigger_flag = True
            condition_str = risk["condition"]
            # FEATURE 4: Trigger Logging
            print(f"[TRIGGER] Worker {user_id} → {condition_str} detected at {curr_lat},{curr_lng}")
        else:
            # FEATURE 4: Check Logging
            print(f"[CHECK] Worker {user_id} → No risk detected")

    response = {
        "lat": curr_lat,
        "lng": curr_lng,
        "status": "moving",
        "trigger": trigger_flag,
        "condition": condition_str
    }
    
    # Include agent status in response
    if agent_result:
        response["agent"] = {
            "claim_triggered": claim_triggered,
            "claim_id": agent_result.get("claim_id"),
            "distress_detected": agent_result.get("distress_detected"),
            "confidence": agent_result.get("confidence"),
            "signals": agent_result.get("signals", []),
            "action": agent_result.get("action_taken")
        }

    return jsonify(response), 200
# =====================================================================
# STEP 2: Rain Trigger Engine (Parametric Event Detection)
# =====================================================================

# FEATURE 2: Event Storage
TRIGGERED_EVENTS = {}

def detect_rain_risk(lat, lng):
    """FEATURE 1: Weather Risk Detection Function"""
    chance = random.random()  # 0.0 to 1.0
    
    if chance < 0.10:  # 10% chance
        return {
            "condition": "storm",
            "severity": "high",
            "trigger": True
        }
    elif chance < 0.40:  # 30% chance (up to 40%)
        return {
            "condition": "rain",
            "severity": "medium",
            "trigger": True
        }
    else:  # 60% chance
        return {
            "condition": "clear",
            "severity": "low",
            "trigger": False
        }

@app.route('/api/trigger/check/<user_id>', methods=['GET'])
def check_rain_trigger(user_id):
    """FEATURE 3: Trigger Check API"""
    user_id = str(user_id)
    
    # Check if worker is active
    if user_id not in ACTIVE_WORKERS:
        return jsonify({"triggered": False}), 200

    state = ACTIVE_WORKERS[user_id]
    route = state["route"]
    
    # Run risk detection on current coords
    risk = detect_rain_risk(route["current_lat"], route["current_lng"])
    
    if risk["trigger"]:
        event_data = {
            "event": "rain_trigger",
            "condition": risk["condition"],
            "severity": risk["severity"],
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "location": {
                "lat": round(route["current_lat"], 5),
                "lng": round(route["current_lng"], 5)
            }
        }
        
        # Store event
        TRIGGERED_EVENTS[user_id] = event_data
        
        return jsonify({
            "triggered": True,
            "event": event_data["event"],
            "condition": event_data["condition"],
            "severity": event_data["severity"]
        }), 200

    return jsonify({"triggered": False}), 200

@app.route('/api/trigger/status/<user_id>', methods=['GET'])
def get_trigger_status(user_id):
    """FEATURE 4: Event Status API"""
    user_id = str(user_id)
    
    if user_id in TRIGGERED_EVENTS:
        event = TRIGGERED_EVENTS[user_id]
        return jsonify({
            "event": event["event"],
            "condition": event["condition"],
            "severity": event["severity"],
            "timestamp": event["timestamp"]
        }), 200

    return jsonify({"event": None}), 200

@app.route('/api/trigger/force', methods=['POST'])
def force_trigger():
    """FEATURE 3: Debug Trigger API"""
    data = request.json
    user_id = str(data.get("user_id"))
    condition = data.get("condition", "rain")

    # Force insert trigger
    event_data = {
        "event": "rain_trigger",
        "condition": condition,
        "severity": "high" if condition == "storm" else "medium",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "location": {"lat": 13.0827, "lng": 80.2707} # Default/generic for force
    }

    # If worker is active, use authentic coords
    if user_id in ACTIVE_WORKERS:
        route = ACTIVE_WORKERS[user_id]["route"]
        event_data["location"] = {
            "lat": round(route["current_lat"], 5),
            "lng": round(route["current_lng"], 5)
        }

    TRIGGERED_EVENTS[user_id] = event_data
    print(f"[TRIGGER FORCED] Worker {user_id} → {condition} forced")

    return jsonify({
        "message": "Trigger forced",
        "event": event_data
    }), 200

# =====================================================================
# CLAIM LIFECYCLE SYSTEM API
# =====================================================================

@app.route('/api/claims/create', methods=['POST'])
@token_required
def create_claim_endpoint(user_id, role):
    """
    Create a claim (auto-generated or manual submission).

    Payload:
    {
        "worker_id": "W-1",
        "worker_name": "John",
        "event_type": "AUTO" | "MANUAL",
        "event_source": "location" | "weather" | "network" | "activity" | "user",
        "claim_type": "accident" | "gps_issue" | ...,
        "description": "Claim description",
        "location_lat": 12.34,
        "location_lng": 56.78
    }
    """
    try:
        from db import create_claim, update_claim_with_verdict

        data = request.get_json() or {}
        worker_id   = data.get('worker_id', f'W-{user_id}')
        worker_name = data.get('worker_name', 'Unknown')
        event_type  = data.get('event_type', 'MANUAL')
        event_source = data.get('event_source', 'user')
        claim_type  = data.get('claim_type', data.get('issue_type', 'GENERAL')) or 'GENERAL'
        description = data.get('description', '')
        location_lat = float(data.get('location_lat', 0.0) or 0.0)
        location_lng = float(data.get('location_lng', 0.0) or 0.0)

        if event_type not in ['AUTO', 'MANUAL']:
            return jsonify({'status': 'error', 'message': 'Invalid event_type'}), 400

        # 1. Create claim in database with SENT status
        result = create_claim(
            worker_id, worker_name, event_type, event_source, description,
            claim_type=claim_type.upper(),
            location_lat=location_lat,
            location_lng=location_lng
        )

        if not result['success']:
            return jsonify({'status': 'error', 'message': result['message']}), 500

        claim_id = result['claim_id']

        # 2. Run Agentic AI to analyze claim
        ai_analysis = agentic_ai_analyze_claim(event_type, event_source, description)

        # 3. Update claim with AI verdict (status remains SENT until admin/AI acts)
        update_claim_with_verdict(
            claim_id,
            ai_analysis['risk_score'],
            ai_analysis['risk_level'],
            ai_analysis['ai_confidence'],
            ai_analysis['ai_verdict'],
            ai_analysis['ai_reasoning_summary'],
            ai_analysis['ai_reasoning_factors']
        )

        print(f"[CLAIM-CREATED] {claim_id} | Worker: {worker_id} | Type: {event_type} | Verdict: {ai_analysis['ai_verdict']} | Score: {ai_analysis['risk_score']}")
        # 4. Fetch complete claim record from DB for the SSE payload
        try:
            from db import get_worker_claims
            fresh = get_worker_claims(worker_id, status_filter=None)
            claim_record = next((c for c in fresh if c['claim_id'] == claim_id), {})
        except Exception:
            claim_record = {}

        # 5. SSE broadcast — pushes instantly to all connected Admin/Worker tabs
        sse_broadcast('new_claim', {
            'claim_id': claim_id,
            'worker_id': worker_id,
            'worker_name': worker_name,
            'claim_type': claim_type.upper(),
            'description': description,
            'status': 'SENT',
            'risk_score': ai_analysis.get('risk_score', 0),
            'ai_confidence': ai_analysis.get('ai_confidence', 0),
            'location_lat': location_lat,
            'location_lng': location_lng,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
        })

        return jsonify({
            'status': 'success',
            'claim_id': claim_id,
            'worker_id': worker_id,
            'initial_status': 'SENT',
            'ai_analysis': ai_analysis
        }), 201

    except Exception as e:
        print(f"[CLAIM-CREATE-ERROR] {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/claims', methods=['GET'])
@token_required
def get_all_claims_endpoint(user_id, role):
    """Get claims. Supports ?worker_id=W-1&status=SENT filtering."""
    try:
        from db import get_all_claims, get_worker_claims

        worker_id_param = request.args.get('worker_id', '').strip()
        status_param    = request.args.get('status', 'ALL').strip().upper()

        if worker_id_param:
            claims = get_worker_claims(worker_id_param, status_filter=status_param)
        else:
            claims = get_all_claims(status_filter=status_param if status_param != 'ALL' else None)

        return jsonify({
            'status': 'success',
            'total': len(claims),
            'claims': claims
        }), 200

    except Exception as e:
        print(f"[GET-CLAIMS-ERROR] {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/claims/<claim_id>/status', methods=['PATCH', 'OPTIONS'])
@token_required
def patch_claim_status(user_id, role, claim_id):
    """
    PATCH /api/claims/<claim_id>/status
    Admin updates claim status. Broadcasts SSE claim_updated to all clients.

    Body: { "status": "APPROVED"|"REJECTED"|"PENDING"|"SENT", "notes": "..." }
    """
    if request.method == 'OPTIONS':
        return '', 204
    if role != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin access required'}), 403

    try:
        from db import update_claim_status, get_claim_by_id

        data       = request.get_json() or {}
        new_status = data.get('status', '').upper()
        notes      = data.get('notes', '')

        if new_status not in ('APPROVED', 'REJECTED', 'PENDING', 'SENT'):
            return jsonify({'status': 'error', 'message': 'Invalid status value'}), 400

        result = update_claim_status(claim_id, new_status, notes)
        if not result.get('success'):
            return jsonify(result), 500

        updated = get_claim_by_id(claim_id) or {}

        # SSE broadcast — worker and admin tabs update immediately
        sse_broadcast('claim_updated', {
            'claim_id': claim_id,
            'status': new_status,
            'worker_id': updated.get('worker_id', ''),
            'worker_name': updated.get('worker_name', ''),
            'notes': notes,
            'updated_by': f'admin-{user_id}',
            'timestamp': datetime.utcnow().isoformat() + 'Z',
        })

        print(f"[CLAIM-PATCH] {claim_id} → {new_status} by admin {user_id}")
        return jsonify({
            'status': 'success',
            'claim_id': claim_id,
            'new_status': new_status,
            'claim': dict(updated) if updated else {}
        }), 200

    except Exception as e:
        print(f"[CLAIM-PATCH-ERROR] {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500



@app.route('/api/worker/<int:w_user_id>/claims', methods=['GET', 'OPTIONS'])
@token_required
def get_worker_claims_endpoint(current_user_id, role, w_user_id):
    """
    Get all claims for a specific worker.
    GET /api/worker/3/claims?status=SENT

    status: ALL | SENT | PENDING | APPROVED | REJECTED  (default: ALL)
    """
    if request.method == 'OPTIONS':
        return '', 204

    try:
        from db import get_worker_claims

        worker_id    = f'W-{w_user_id}'
        status_param = request.args.get('status', 'ALL').strip().upper()

        claims = get_worker_claims(
            worker_id,
            status_filter=status_param if status_param != 'ALL' else None
        )

        return jsonify({
            'status': 'success',
            'worker_id': worker_id,
            'filter': status_param,
            'total': len(claims),
            'claims': claims
        }), 200

    except Exception as e:
        print(f"[GET-WORKER-CLAIMS-ERROR] {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500



@app.route('/api/admin/claims-lifecycle', methods=['GET'])
@token_required
def get_admin_claims_lifecycle(user_id, role):
    """Get all claims for admin dashboard (with full AI reasoning)."""
    if role != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin access required'}), 403
    
    try:
        from db import get_all_claims
        
        status_filter = request.args.get('status', 'ALL').upper()
        
        all_claims = get_all_claims()
        
        # Filter by status
        if status_filter != 'ALL':
            if status_filter not in ['PENDING', 'APPROVED', 'REJECTED']:
                return jsonify({'status': 'error', 'message': 'Invalid status'}), 400
            all_claims = [c for c in all_claims if c.get('status') == status_filter]
        
        # Parse JSON fields and add verdict badge info
        for claim in all_claims:
            if claim.get('ai_reasoning_factors'):
                try:
                    claim['ai_reasoning_factors'] = json.loads(claim['ai_reasoning_factors'])
                except:
                    claim['ai_reasoning_factors'] = []
            else:
                claim['ai_reasoning_factors'] = []
            
            # Add decision logic explanation
            risk_score = claim.get('risk_score', 0)
            verdict = claim.get('ai_verdict', 'PENDING')
            
            if risk_score < 40:
                claim['verdict_logic'] = f'Score {risk_score} < 40 → REJECTED'
            elif risk_score <= 75:
                claim['verdict_logic'] = f'Score {risk_score} (40-75) → PENDING'
            else:
                claim['verdict_logic'] = f'Score {risk_score} > 75 → APPROVED'
        
        return jsonify({
            'status': 'success',
            'total': len(all_claims),
            'filter': status_filter,
            'claims': all_claims
        }), 200
    
    except Exception as e:
        print(f"[GET-ADMIN-CLAIMS-ERROR] {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/admin/claim-action-lifecycle', methods=['POST'])
@token_required
def admin_claim_action_lifecycle(user_id, role):
    """Admin action on lifecycle claim: APPROVE, REJECT, or HOLD."""
    if role != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin access required'}), 403
    
    try:
        from db import update_claim_status, get_claim_by_id
        
        data = request.get_json() or {}
        claim_id = data.get('claim_id')
        action = data.get('action', '').upper()
        notes = data.get('notes', '')
        
        if not claim_id or action not in ['APPROVE', 'REJECT', 'HOLD']:
            return jsonify({'status': 'error', 'message': 'Invalid claim_id or action'}), 400
        
        # Map action to status
        status_map = {
            'APPROVE': 'APPROVED',
            'REJECT': 'REJECTED',
            'HOLD': 'PENDING'
        }
        
        new_status = status_map[action]
        
        # Update claim
        result = update_claim_status(claim_id, new_status, notes)
        
        if not result['success']:
            return jsonify(result), 500
        
        # Fetch updated claim
        updated_claim = get_claim_by_id(claim_id)
        
        print(f"[ADMIN-OVERRIDE] Claim {claim_id}: {action} by admin {user_id}")
        
        return jsonify({
            'status': 'success',
            'message': f'Claim {action.lower()}ed',
            'claim': updated_claim
        }), 200
    
    except Exception as e:
        print(f"[ADMIN-ACTION-ERROR] {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# =====================================================================
# LIVE RISK DETECTION - DEMO ENDPOINT
# =====================================================================

@app.route('/api/simulate-risk', methods=['POST'])
def simulate_risk():
    """
    LIVE RISK DETECTION: Simulate a high-risk event for demo purposes
    
    This endpoint generates a realistic high-risk scenario for a worker.
    If risk_score >= 70 and risk_level == "HIGH", automatically generates an AI claim.
    
    Request:
    {
      "worker_id": "W-1"  (optional, defaults to W-1)
    }
    
    Response:
    {
      "worker_id": "W-1",
      "risk_score": 87,
      "risk_level": "HIGH",
      "reasons": [...],
      "timestamp": "2026-04-17T13:45:30.000Z",
      "alert_type": "CRITICAL",
      "claim_generated": true,
      "claim": {
        "claim_id": "AIC-xxxxx",
        "status": "PENDING",
        "source": "AI_GENERATED",
        "ai_confidence": 97
      }
    }
    """
    try:
        data = request.get_json() or {}
        worker_id = data.get('worker_id', 'W-1')
        
        # Extract user_id from worker_id (W-{user_id})
        try:
            user_id = int(worker_id.replace('W-', ''))
        except:
            user_id = 1  # Default fallback
        
        # Use provided risk_score or generate random one for demo
        if 'risk_score' in data:
            risk_score = data['risk_score']
        else:
            risk_score = random.randint(80, 100)
        
        # Use provided risk_level or default to HIGH
        if 'risk_level' in data:
            risk_level = data['risk_level']
        else:
            risk_level = 'HIGH'
        
        # Risk event reasons (curated for demo impact)
        reason_pool = [
            "No movement for 30 minutes",
            "Entered unsafe zone (high-risk area)",
            "Abnormal movement pattern detected",
            "Vital signs showing distress indicators",
            "Extended lone working exceeds safety limits",
            "Rapid location change detected",
            "Worker not responding to check-ins",
            "Environment hazard alert triggered"
        ]
        
        # Select 2-3 random reasons for variety
        selected_reasons = random.sample(reason_pool, k=random.randint(2, 3))
        
        # Use provided reason if available
        if 'reason' in data:
            selected_reasons = [data['reason']]
        
        # Use provided distress condition if available
        distress_condition = data.get('distress_condition', 'AUTONOMOUS_AI_DETECTION')
        
        # Build risk event response
        risk_data = {
            'worker_id': worker_id,
            'risk_score': risk_score,
            'risk_level': risk_level,
            'reasons': selected_reasons,
            'timestamp': datetime.utcnow().isoformat(),
            'alert_type': 'CRITICAL',
            'severity': 'high',
            'ai_confidence': data.get('ai_confidence', random.randint(85, 99)),  # Use provided or generate
            'claim_generated': False,
            'claim': None
        }
        
        print(f"[RISK SIMULATION] Worker {worker_id} | Score: {risk_score} | Level: {risk_level} | Reasons: {selected_reasons}")
        print(f"[DEBUG] risk_score={risk_score}, risk_level={risk_data['risk_level']}, condition result={risk_score >= 70 and risk_data['risk_level'] == 'HIGH'}")
        
        # ═════════════════════════════════════════════════════════════════
        # PART 1: AUTO-CLAIM GENERATION (Autonomous AI)
        # ═════════════════════════════════════════════════════════════════
        
        # TRIGGER CHECK: Generate claim if HIGH risk is detected
        if risk_score >= 70 and risk_data['risk_level'] == 'HIGH':
            try:
                # Check if worker already has a pending claim (prevent duplicates)
                conn = get_db_connection()
                
                existing_pending = conn.execute("""
                    SELECT claim_id FROM ai_claims 
                    WHERE worker_id = ? AND status = 'PENDING' 
                    ORDER BY created_at DESC LIMIT 1
                """, (worker_id,)).fetchone()
                
                conn.close()
                
                # Only generate new claim if no pending claim exists
                if not existing_pending:
                    # Generate AI claim automatically
                    claim_result = create_ai_claim(
                        user_id=user_id,
                        worker_id=worker_id,
                        location_lat=20.5937,  # Default India location for demo
                        location_lng=78.9629,
                        reason=f"Multiple risk factors detected: {', '.join(selected_reasons[:2])}",
                        distress_condition="AUTONOMOUS_AI_DETECTION",
                        ai_confidence=risk_data['ai_confidence'],
                        detection_signals=json.dumps({
                            'risk_factors': selected_reasons,
                            'risk_score': risk_score,
                            'detection_method': 'AUTONOMOUS_AI'
                        })
                    )
                    
                    # Update response with claim data including XAI explanation
                    risk_data['claim_generated'] = True
                    risk_data['claim'] = {
                        'claim_id': claim_result['claim_id'],
                        'status': 'PENDING',
                        'source': 'AI_GENERATED',
                        'ai_confidence': risk_data['ai_confidence'],
                        'risk_score': risk_score,
                        'explanation': claim_result.get('explanation', {})  # Include XAI explanation
                    }
                    
                    print(f"[AUTO-CLAIM GENERATED] {claim_result['claim_id']} for {worker_id}")
                else:
                    print(f"[AUTO-CLAIM SKIPPED] Pending claim exists for {worker_id}")
            
            except Exception as claim_error:
                print(f"[AUTO-CLAIM ERROR] Failed to generate claim: {claim_error}")
                # Don't fail the risk response if claim generation fails
        
        return jsonify(risk_data), 200
        
    except Exception as e:
        print(f"[RISK SIMULATION ERROR] {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Failed to simulate risk: {str(e)}'
        }), 500

# =====================================================================
# PART 3 — LIGHTWEIGHT RAG: Fraud Knowledge Base
# =====================================================================

# ADD: Static retrieval knowledge base (no vector DB needed)
FRAUD_KNOWLEDGE_BASE = [
    "Low accelerometer variance indicates spoofing",          # index 0
    "No cell tower handoff suggests stationary device",       # index 1
    "Rain mismatch with location indicates false claim",      # index 2
    "Repeated claims indicate potential fraud pattern"        # index 3
]

def retrieve_context(signals: dict) -> list:
    """ADD: Retrieves relevant fraud context entries based on signal flags."""
    context = []
    if signals.get("accelerometer", 1.0) < 0.1:
        context.append(FRAUD_KNOWLEDGE_BASE[0])
    if not signals.get("network_switch", False):
        context.append(FRAUD_KNOWLEDGE_BASE[1])
    if not signals.get("rain_confirmed", False):
        context.append(FRAUD_KNOWLEDGE_BASE[2])
    if signals.get("repeat_claim", False):
        context.append(FRAUD_KNOWLEDGE_BASE[3])
    return context

# =====================================================================
# PART 2 — SIGNAL-BASED GAP FINDER (no external API dependency)
# =====================================================================

def run_gap_finder_local(claim_data: dict) -> dict:
    """ADD: Rule-based risk scoring from signals. Does NOT touch existing run_gap_finder_ai."""
    signals = claim_data.get("signals", {})
    score = 0
    reasons = []

    # Movement validation
    if signals.get("accelerometer", 1.0) < 0.1:
        score += 30
        reasons.append("Low movement detected")

    # Network validation
    if not signals.get("network_switch", False):
        score += 20
        reasons.append("No network switching")

    # Weather validation
    if not signals.get("rain_confirmed", False):
        score += 25
        reasons.append("No rain detected in region")

    # Behavioral pattern
    if signals.get("repeat_claim", False):
        score += 25
        reasons.append("Repeated claim pattern")

    capped = min(score, 100)
    return {
        "risk_score": capped,
        "reasons": reasons,
        "verdict": "high" if capped > 70 else "medium" if capped > 35 else "low"
    }

# =====================================================================
# DEBUG / VERIFICATION ENDPOINT (PART 4 — AI + RAG combined)
# =====================================================================

@app.route('/api/debug/full-status/<user_id>', methods=['GET'])
def debug_full_status(user_id):
    """Run AI-powered fraud detection using the new run_gap_finder_ai function."""
    user_id = str(user_id)

    worker = ACTIVE_WORKERS.get(user_id)
    if not worker:
        return jsonify({"error": "Worker not active"}), 404

    location = {
        "lat": worker["route"]["current_lat"],
        "lng": worker["route"]["current_lng"]
    }

    # Build a realistic claim object for AI analysis
    claim_data = {
        "gps_coords": location,
        "activity_status": "active",
        "movement_pattern": {
            "distance_travel_meters": random.uniform(50, 500),
            "duration_seconds": random.uniform(30, 300)
        },
        "network_proximity": {
            "towers_in_range": random.randint(1, 8)
        },
        "environment": {
            "weather_api_data": "Clear sky" if random.random() > 0.3 else "Light rain, 28°C"
        }
    }

    # Call the new Claude AI-powered fraud detection
    ai_result = run_gap_finder_ai(claim_data)

    return jsonify({
        "worker": worker,
        "location": location,
        "trigger_check": ai_result,
        "ai": {
            "fraud_score": ai_result.get("fraud_score", 0),
            "risk_level": ai_result.get("verdict", "low"),
            "trigger": ai_result.get("trigger", False),
            "reason": ai_result.get("reason", "No risk detected")
        }
    }), 200



# Lightweight RAG: In-memory fraud pattern knowledge base
FRAUD_PATTERNS = [
    "sudden teleport location change (>100km without movement time)",
    "no network towers nearby but GPS reports movement",
    "bad weather but worker still moving at delivery speed",
    "inactive worker status but sending location updates",
    "repeated identical routes with same timestamps",
    "gps drift beyond typical device error margins",
    "movement speed exceeds vehicle capability"
]

def select_relevant_patterns(claim_data):
    """Select 2-3 relevant fraud patterns based on claim context (lightweight RAG)."""
    selected = []
    
    # Pattern matching logic
    if claim_data.get("activity_status") == "inactive" and claim_data.get("movement_pattern", {}).get("distance_travel_meters", 0) > 100:
        selected.append(FRAUD_PATTERNS[3])  # inactive but moving
    
    weather = claim_data.get("environment", {}).get("weather_api_data", "").lower()
    if any(cond in weather for cond in ["rain", "storm", "thunderstorm", "heavy"]):
        selected.append(FRAUD_PATTERNS[2])  # bad weather context
    
    if not claim_data.get("network_proximity", {}).get("towers_in_range", 0) and claim_data.get("gps_coords"):
        selected.append(FRAUD_PATTERNS[1])  # no towers but gps active
    
    return selected[:3]  # Return max 3 patterns

def run_gap_finder_ai(claim_data):
    """AI-based fraud detection using Claude Haiku with lightweight RAG."""
    
    # Fallback if API not configured
    if not anthropic_client:
        return {
            "fraud_score": 15,
            "trigger": False,
            "verdict": "low",
            "reason": "API unavailable - baseline analysis shows low risk signals."
        }
    
    try:
        # Extract and structure claim data for AI
        ai_input = {
            "location": {
                "lat": claim_data.get("gps_coords", {}).get("lat"),
                "lng": claim_data.get("gps_coords", {}).get("lng")
            },
            "weather": claim_data.get("environment", {}).get("weather_api_data", "unknown"),
            "network": f"towers_nearby: {claim_data.get('network_proximity', {}).get('towers_in_range', 0)}",
            "movement_pattern": f"distance: {claim_data.get('movement_pattern', {}).get('distance_travel_meters', 0)}m, duration: {claim_data.get('movement_pattern', {}).get('duration_seconds', 0)}s",
            "activity_status": claim_data.get("activity_status", "unknown"),
            "context_patterns": select_relevant_patterns(claim_data)
        }
        
        # System prompt for Claude
        SYSTEM_PROMPT = """You are a fraud detection AI analyzing worker activity in a logistics platform.
You must detect anomalies using reasoning, not rules. Analyze the provided signals and return ONLY valid JSON."""
        
        # Build user prompt
        user_prompt = f"""Analyze this worker claim for GPS spoofing or fraud indicators.

Patterns to consider: {', '.join(ai_input['context_patterns'])}

Claim context: {json.dumps(ai_input)}

Return ONLY this JSON with no markdown or extra text:
{{"fraud_score": <0-100>, "risk_level": "low"|"medium"|"high", "trigger": true/false, "reasoning": "<brief explanation>"}}"""
        
        # Call Claude Haiku API
        response = anthropic_client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=300,
            temperature=0.2,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}]
        )
        
        # Parse response safely
        text = response.content[0].text.strip()
        text = text.replace("```json", "").replace("```", "").strip()
        ai_output = json.loads(text)
        
        # Return in required format
        return {
            "fraud_score": ai_output.get("fraud_score", 25),
            "trigger": ai_output.get("trigger", False),
            "verdict": ai_output.get("risk_level", "low"),
            "reason": ai_output.get("reasoning", "AI analysis complete.")
        }
        
    except Exception as e:
        # Fallback safety: return conservative safe values on any error
        print(f"AI ERROR: {e}")
        return {
            "fraud_score": 30,
            "trigger": False,
            "verdict": "medium",
            "reason": "AI analysis skipped due to error. Manual review recommended."
        }

# ═══════════════════════════════════════════════════════════════════════════
# ADMIN API: AUTONOMOUS AI CLAIMS MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════

@app.route('/api/admin/claims', methods=['GET'])
@token_required
def get_admin_claims(user_id, role):
    """
    Get all claims from unified claims table for admin dashboard.
    
    Query Parameters:
    - status: PENDING, APPROVED, REJECTED, or ALL (default: ALL)
    
    Response: List of all claims with payment status and AI analysis
    """
    if role != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin access required'}), 403
    
    try:
        status_filter = request.args.get('status', 'ALL').upper()
        
        conn = get_db_connection()
        
        # Query unified claims table with optional left-join to users for phone
        if status_filter != 'ALL':
            if status_filter not in ('SENT', 'PENDING', 'APPROVED', 'REJECTED'):
                return jsonify({'status': 'error', 'message': 'Invalid status'}), 400
            all_claims = [dict(row) for row in conn.execute(
                "SELECT c.*, u.phone as worker_phone FROM claims c "
                "LEFT JOIN users u ON (CAST(REPLACE(c.worker_id,'W-','') AS INTEGER) = u.id) "
                "WHERE c.status = ? ORDER BY c.created_at DESC",
                (status_filter,)
            ).fetchall()]
        else:
            all_claims = [dict(row) for row in conn.execute(
                "SELECT c.*, u.phone as worker_phone FROM claims c "
                "LEFT JOIN users u ON (CAST(REPLACE(c.worker_id,'W-','') AS INTEGER) = u.id) "
                "ORDER BY c.created_at DESC"
            ).fetchall()]

        print(f"[ADMIN-CLAIMS] Retrieved {len(all_claims)} claims with status filter: {status_filter}", flush=True)

        conn.close()

        # Format response
        claims_list = []
        for claim in all_claims:
            try:
                # Parse ai_reasoning_factors JSON if stored as string
                ai_factors = claim.get('ai_reasoning_factors')
                if isinstance(ai_factors, str):
                    try:
                        ai_factors = json.loads(ai_factors)
                    except Exception:
                        ai_factors = []

                formatted = {
                    'claim_id': str(claim.get('claim_id', '')),
                    'worker_id': str(claim.get('worker_id', '')),
                    'worker_name': str(claim.get('worker_name', '')),
                    'worker_phone': str(claim.get('worker_phone', '') or ''),
                    'timestamp': str(claim.get('created_at', '')),
                    'event_type': str(claim.get('event_type', 'MANUAL')),
                    'event_source': str(claim.get('event_source', '')),
                    'claim_type': str(claim.get('claim_type', 'GENERAL')),
                    'description': str(claim.get('description', '')),
                    'location_lat': float(claim.get('location_lat', 0) or 0),
                    'location_lng': float(claim.get('location_lng', 0) or 0),
                    'risk_score': int(claim.get('risk_score', 0) or 0),
                    'risk_level': str(claim.get('risk_level', '') or ''),
                    'ai_confidence': float(claim.get('ai_confidence', 0) or 0),
                    'ai_verdict': str(claim.get('ai_verdict', '') or ''),
                    'status': str(claim.get('status', '')),
                    'ai_reasoning_summary': str(claim.get('ai_reasoning_summary', '') or ''),
                    'ai_reasoning_factors': ai_factors or [],
                    'admin_override_reason': claim.get('admin_override_reason', ''),
                    'payment_status': str(claim.get('payment_status', 'UNPAID')),
                    'payment_id': claim.get('payment_id'),
                    'payout_amount': int(claim.get('payout_amount', 0) or 0),
                    'order_id': claim.get('order_id'),
                    'created_at': str(claim.get('created_at', '')),
                    'updated_at': str(claim.get('updated_at', '')),
                }
                claims_list.append(formatted)
            except Exception as e:
                print(f"[ADMIN-CLAIMS] Error formatting claim {claim.get('claim_id')}: {str(e)}", flush=True)
                continue

        return jsonify({
            'status': 'success',
            'filter': status_filter,
            'total': len(claims_list),
            'claims': claims_list
        }), 200

    except Exception as e:
        print(f"[ADMIN-CLAIMS-ERROR] {str(e)}", flush=True)
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/admin/claim-action', methods=['POST'])
@token_required
def admin_claim_action(user_id, role):
    """
    Admin action on claim: APPROVE, REJECT, or HOLD.
    Updates the `claims` table (not ai_claims) and broadcasts SSE.

    Payload: { "claim_id": "CLM-xxx", "action": "APPROVE"|"REJECT"|"HOLD", "notes": "..." }
    """
    if role != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin access required'}), 403

    try:
        from db import update_claim_status, get_claim_by_id

        data     = request.get_json() or {}
        claim_id = data.get('claim_id')
        action   = data.get('action', '').upper()
        notes    = data.get('notes', '')

        if not claim_id or action not in ('APPROVE', 'REJECT', 'HOLD'):
            return jsonify({'status': 'error', 'message': 'Invalid claim_id or action'}), 400

        status_map = {'APPROVE': 'APPROVED', 'REJECT': 'REJECTED', 'HOLD': 'PENDING'}
        new_status = status_map[action]

        result = update_claim_status(claim_id, new_status, notes)
        if not result.get('success'):
            return jsonify({'status': 'error', 'message': result.get('message', 'Update failed')}), 500

        updated = get_claim_by_id(claim_id) or {}

        # SSE broadcast — all tabs update immediately
        sse_broadcast('claim_updated', {
            'claim_id': claim_id,
            'status': new_status,
            'worker_id': updated.get('worker_id', ''),
            'worker_name': updated.get('worker_name', ''),
            'notes': notes,
            'updated_by': f'admin-{user_id}',
            'timestamp': datetime.utcnow().isoformat() + 'Z',
        })

        print(f"[ADMIN ACTION] Claim {claim_id}: {action} → {new_status} by admin {user_id}")

        return jsonify({
            'status': 'success',
            'message': f'Claim {action.lower()}ed',
            'claim': dict(updated) if updated else {}
        }), 200

    except Exception as e:
        print(f"[ERROR] Admin claim action failed: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/admin/claims/pending', methods=['GET'])
@token_required
def get_pending_claims(user_id, role):
    """Get only pending claims awaiting admin review."""
    if role != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin access required'}), 403
    
    try:
        claims = get_pending_ai_claims()
        
        enriched_claims = []
        for claim in claims:
            enriched = dict(claim)
            enriched['location'] = {
                'lat': claim['location_lat'],
                'lng': claim['location_lng']
            }
            enriched_claims.append(enriched)
        
        return jsonify({
            'status': 'success',
            'pending_count': len(enriched_claims),
            'claims': enriched_claims
        }), 200
    
    except Exception as e:
        print(f"[ERROR] Getting pending claims: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/admin/claims/<claim_id>', methods=['GET'])
@token_required
def get_single_ai_claim(user_id, role, claim_id):
    """Get details of a specific AI-generated claim."""
    if role != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin access required'}), 403
    
    try:
        claim = get_ai_claim_by_id(claim_id)
        
        if not claim:
            return jsonify({'status': 'error', 'message': 'Claim not found'}), 404
        
        # Enrich with location
        claim_data = dict(claim)
        claim_data['location'] = {
            'lat': claim['location_lat'],
            'lng': claim['location_lng']
        }
        
        # Parse detection signals if JSON
        if claim['detection_signals']:
            try:
                claim_data['detection_signals_parsed'] = json.loads(claim['detection_signals'])
            except:
                claim_data['detection_signals_parsed'] = claim['detection_signals']
        
        return jsonify({
            'status': 'success',
            'claim': claim_data
        }), 200
    
    except Exception as e:
        print(f"[ERROR] Getting claim {claim_id}: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/admin/claims/<claim_id>/approve', methods=['POST'])
@token_required
def approve_claim(user_id, role, claim_id):
    """Admin approves a pending claim for insurance payout."""
    if role != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin access required'}), 403
    
    try:
        data = request.json or {}
        admin_notes = data.get('notes', '')
        
        # Update claim status
        updated_claim = update_ai_claim_status(claim_id, 'approved', admin_notes)
        
        if not updated_claim:
            return jsonify({'status': 'error', 'message': 'Claim not found'}), 404
        
        # Log approval
        print(f"[CLAIM APPROVED] {claim_id} by admin {user_id}")
        
        return jsonify({
            'status': 'success',
            'message': 'Claim approved successfully',
            'claim': dict(updated_claim)
        }), 200
    
    except Exception as e:
        print(f"[ERROR] Approving claim {claim_id}: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/admin/claims/<claim_id>/reject', methods=['POST'])
@token_required
def reject_claim(user_id, role, claim_id):
    """Admin rejects a pending claim."""
    if role != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin access required'}), 403
    
    try:
        data = request.json or {}
        admin_notes = data.get('notes', 'No reason provided')
        
        # Update claim status
        updated_claim = update_ai_claim_status(claim_id, 'rejected', admin_notes)
        
        if not updated_claim:
            return jsonify({'status': 'error', 'message': 'Claim not found'}), 404
        
        # Log rejection
        print(f"[CLAIM REJECTED] {claim_id} by admin {user_id}")
        
        return jsonify({
            'status': 'success',
            'message': 'Claim rejected',
            'claim': dict(updated_claim)
        }), 200
    
    except Exception as e:
        print(f"[ERROR] Rejecting claim {claim_id}: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/admin/claims/worker/<worker_id>', methods=['GET'])
@token_required
def get_admin_worker_claims(user_id, role, worker_id):
    """Get all AI-generated claims for a specific worker."""
    if role != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin access required'}), 403
    
    try:
        claims = get_claims_by_worker(worker_id)
        
        enriched_claims = []
        for claim in claims:
            enriched = dict(claim)
            enriched['location'] = {
                'lat': claim['location_lat'],
                'lng': claim['location_lng']
            }
            enriched_claims.append(enriched)
        
        return jsonify({
            'status': 'success',
            'worker_id': worker_id,
            'claim_count': len(enriched_claims),
            'claims': enriched_claims
        }), 200
    
    except Exception as e:
        print(f"[ERROR] Getting claims for worker {worker_id}: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/admin/claims/stats', methods=['GET'])
@token_required
def get_claims_stats(user_id, role):
    """Get statistics on AI-generated claims."""
    if role != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin access required'}), 403
    
    try:
        all_claims = get_all_ai_claims()
        pending = [c for c in all_claims if c['status'] == 'pending']
        approved = [c for c in all_claims if c['status'] == 'approved']
        rejected = [c for c in all_claims if c['status'] == 'rejected']
        
        # Group by condition
        conditions = {}
        for claim in all_claims:
            condition = claim.get('distress_condition', 'unknown')
            conditions[condition] = conditions.get(condition, 0) + 1
        
        return jsonify({
            'status': 'success',
            'total_claims': len(all_claims),
            'pending': len(pending),
            'approved': len(approved),
            'rejected': len(rejected),
            'conditions': conditions,
            'approval_rate': round(len(approved) / max(len(approved) + len(rejected), 1) * 100, 2)
        }), 200
    
    except Exception as e:
        print(f"[ERROR] Getting claims stats: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# AGENTIC AI - WORKER RISK MONITORING & AUTO-CLAIM TRIGGERING
# All claims processing now routes through agentic_engine.py
# ════════════════════════════════════════════════════════════════════════════

@app.route('/api/worker/<int:worker_id>/risk', methods=['GET'])
@token_required
def get_worker_risk_status(user_id, role, worker_id):
    """Get current risk score and status for a worker."""
    # For demo, check if user is requesting their own risk
    if user_id != worker_id and role != 'admin':
        return jsonify({'status': 'error', 'message': 'Access denied'}), 403
    
    # Try to fetch from database
    risk_data = get_worker_risk(worker_id)
    
    if risk_data:
        import json
        reasons = json.loads(risk_data.get('reasons', '[]')) if isinstance(risk_data.get('reasons'), str) else risk_data.get('reasons', [])
        return jsonify({
            'status': 'success',
            'risk_score': risk_data['current_risk_score'],
            'risk_level': risk_data['risk_level'],
            'ai_status': risk_data['ai_status'],
            'reasons': reasons,
            'updated_at': risk_data['updated_at']
        }), 200
    
    # Default safe status
    return jsonify({
        'status': 'success',
        'risk_score': 0,
        'risk_level': 'LOW',
        'ai_status': 'SAFE',
        'reasons': [],
        'updated_at': datetime.utcnow().isoformat()
    }), 200


@app.route('/api/worker/<int:worker_id>/risk/update', methods=['POST'])
@token_required
def update_worker_risk(user_id, role, worker_id):
    """Update worker risk score with various signals via Agentic AI pipeline."""
    data = request.json
    
    # Extract signals
    inactivity_minutes = data.get('inactivity_minutes', 0)
    has_movement_anomaly = data.get('has_movement_anomaly', False)
    is_in_danger_zone = data.get('is_in_danger_zone', False)
    location_lat = data.get('location_lat', 0.0)
    location_lng = data.get('location_lng', 0.0)
    
    # Route through Agentic AI processing pipeline
    result = process_worker_event(
        worker_id=worker_id,
        user_id=worker_id,
        location_lat=location_lat,
        location_lng=location_lng,
        inactivity_minutes=inactivity_minutes,
        has_movement_anomaly=has_movement_anomaly,
        is_in_danger_zone=is_in_danger_zone
    )
    
    if result['status'] == 'error':
        return jsonify(result), 500
    
    return jsonify({
        'status': 'success',
        'risk_score': result['risk_score'],
        'risk_level': result['risk_level'],
        'ai_status': result['ai_status'],
        'reasons': result['risk_factors'],
        'claim_triggered': result['claim_triggered'],
        'claim_id': result['claim_id'],
        'decision': result['decision'],
        'message': 'AI processing complete' if not result['claim_triggered'] else 'Emergency detected. AI initiated insurance claim...'
    }), 200


# NOTE: /api/worker/<int:worker_id>/claims is now handled by get_worker_claims_endpoint
# defined above (around line 1552). That version queries the `claims` table (not ai_claims)
# and fully supports SENT / PENDING / APPROVED / REJECTED status filtering.
# This stub is intentionally left blank to avoid route conflicts.


# ═══════════════════════════════════════════════════════════════════════════
# PART 1: AI PROCESSING PIPELINE ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@app.route('/api/process-event', methods=['POST'])
def process_worker_event_endpoint():
    """
    MAIN AI PROCESSING PIPELINE ENDPOINT
    
    Triggers full AI processing for worker events:
    - Receives worker event data
    - Analyzes risk factors
    - Calculates risk score (0-100)
    - Auto-generates claims if risk is HIGH (>70)
    
    Request Body:
    {
        "worker_id": "123",
        "user_id": 1,
        "location_lat": 19.076,
        "location_lng": 72.877,
        "inactivity_minutes": 35,
        "has_movement_anomaly": false,
        "is_in_danger_zone": false,
        "rapid_location_change": false,
        "after_hours": false,
        "repeated_trigger": false
    }
    
    Response:
    {
        "status": "success",
        "worker_id": "123",
        "risk_score": 85,
        "risk_level": "HIGH",
        "decision": "CLAIM_CREATED",
        "claim_id": "AIC-xxxxx",
        "reasons": ["No movement for 35 minutes", ...],
        "timestamp": "2026-04-17T13:45:30.000Z"
    }
    """
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['worker_id', 'user_id', 'location_lat', 'location_lng']
        if not all(field in data for field in required_fields):
            return jsonify({
                'status': 'error',
                'message': f'Missing required fields. Required: {required_fields}'
            }), 400
        
        # Extract data with defaults
        worker_id = data.get('worker_id')
        user_id = data.get('user_id')
        location_lat = float(data.get('location_lat', 0))
        location_lng = float(data.get('location_lng', 0))
        inactivity_minutes = int(data.get('inactivity_minutes', 0))
        has_movement_anomaly = bool(data.get('has_movement_anomaly', False))
        is_in_danger_zone = bool(data.get('is_in_danger_zone', False))
        rapid_location_change = bool(data.get('rapid_location_change', False))
        after_hours = bool(data.get('after_hours', False))
        repeated_trigger = bool(data.get('repeated_trigger', False))
        
        # Log incoming event
        app.logger.info(f"[API-PROCESS-EVENT] Received event for worker {worker_id}")
        
        # Process through AI pipeline
        result = process_worker_event(
            worker_id=worker_id,
            user_id=user_id,
            location_lat=location_lat,
            location_lng=location_lng,
            inactivity_minutes=inactivity_minutes,
            has_movement_anomaly=has_movement_anomaly,
            is_in_danger_zone=is_in_danger_zone
        )
        
        # Log result
        app.logger.info(f"[API-PROCESS-EVENT] Processing complete | Risk: {result.get('risk_score')} | Decision: {'CLAIM' if result.get('claim_triggered') else 'NO_ACTION'}")
        
        return jsonify({
            'status': result.get('status'),
            'worker_id': result.get('worker_id'),
            'user_id': result.get('user_id'),
            'risk_score': result.get('risk_score'),
            'risk_level': result.get('risk_level'),
            'ai_status': result.get('ai_status'),
            'decision': 'CLAIM_CREATED' if result.get('claim_triggered') else 'NO_ACTION',
            'claim_id': result.get('claim_id'),
            'reasons': result.get('risk_factors', []),
            'timestamp': result.get('timestamp'),
            'location': result.get('location')
        }), 200
        
    except Exception as e:
        app.logger.error(f"[API-PROCESS-EVENT] Error: {str(e)}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': f'Error processing event: {str(e)}'
        }), 500


# ═══════════════════════════════════════════════════════════════════════════
# PART 2: AI CLAIMS MANAGEMENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@app.route('/api/ai-claims', methods=['GET'])
@token_required
def get_ai_claims(user_id, role):
    """
    Get all AI-generated claims with optional filtering.
    
    Query Parameters:
    - status: PENDING, SENT, REJECTED, or ALL (default: ALL)
    - source: AI_GENERATED (default filter)
    - worker_id: Optional worker filter
    
    Response: List of AI claims with enriched worker data
    """
    try:
        status_filter = request.args.get('status', 'ALL').upper()
        worker_filter = request.args.get('worker_id', None)
        
        app.logger.info(f"[API-AI-CLAIMS] Fetching AI claims | Status: {status_filter} | Worker: {worker_filter}")
        
        # Fetch all AI-generated claims directly from database
        conn = get_db_connection()
        query = "SELECT * FROM ai_claims WHERE source = 'AI_GENERATED'"
        all_claims = [dict(row) for row in conn.execute(query).fetchall()]
        conn.close()
        
        app.logger.info(f"[API-AI-CLAIMS] Found {len(all_claims)} AI-generated claims in DB")
        
        # Filter by source (already done in query, but keep for safety)
        ai_claims = [c for c in all_claims if c.get('source') == 'AI_GENERATED']
        
        # Apply status filter
        if status_filter != 'ALL':
            if status_filter not in ['PENDING', 'SENT', 'REJECTED', 'APPROVED']:
                return jsonify({'status': 'error', 'message': 'Invalid status filter'}), 400
            ai_claims = [c for c in ai_claims if c.get('status') == status_filter]
        
        # Apply worker filter if provided
        if worker_filter:
            ai_claims = [c for c in ai_claims if c.get('worker_id') == f"W-{worker_filter}"]
        
        # Enrich with worker data
        enriched_claims = enrich_claims(ai_claims)
        
        app.logger.info(f"[API-AI-CLAIMS] Returning {len(enriched_claims)} claims")
        
        return jsonify({
            'status': 'success',
            'total': len(enriched_claims),
            'filter': {
                'status': status_filter,
                'source': 'AI_GENERATED',
                'worker_id': worker_filter
            },
            'claims': enriched_claims
        }), 200
        
    except Exception as e:
        print(f"[API-AI-CLAIMS-ERROR] {str(e)}")
        app.logger.error(f"[API-AI-CLAIMS] Error: {str(e)}", exc_info=True)
        # Return empty array on error instead of crashing
        return jsonify({
            'status': 'error',
            'message': f'Error fetching AI claims: {str(e)}',
            'total': 0,
            'claims': []
        }), 200


@app.route('/api/ai-claims/<claim_id>/status', methods=['PUT'])
@token_required
def update_ai_claim_status_endpoint(user_id, role, claim_id):
    """
    Update AI claim status (PENDING → SENT/REJECTED).
    
    Request Body:
    {
        "status": "SENT" or "REJECTED",
        "admin_notes": "Optional decision notes"
    }
    """
    try:
        data = request.get_json()
        new_status = data.get('status', '').upper()
        admin_notes = data.get('admin_notes', '')
        
        if new_status not in ['SENT', 'REJECTED']:
            return jsonify({
                'status': 'error',
                'message': 'Status must be SENT or REJECTED'
            }), 400
        
        app.logger.info(f"[API-CLAIM-STATUS] Updating claim {claim_id} → {new_status}")
        
        # Update claim status
        result = update_ai_claim_status(claim_id, new_status)
        
        if not result:
            return jsonify({
                'status': 'error',
                'message': f'Claim {claim_id} not found'
            }), 404
        
        app.logger.info(f"[API-CLAIM-STATUS] Claim {claim_id} updated successfully")
        
        return jsonify({
            'status': 'success',
            'claim_id': claim_id,
            'new_status': new_status,
            'admin_notes': admin_notes,
            'timestamp': datetime.utcnow().isoformat()
        }), 200
        
    except Exception as e:
        app.logger.error(f"[API-CLAIM-STATUS] Error: {str(e)}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': f'Error updating claim: {str(e)}'
        }), 500


@app.route('/api/ai-claims/stats', methods=['GET'])
@token_required
def get_ai_claims_stats(user_id, role):
    """
    Get statistics on AI-generated claims.
    
    Returns:
    {
        "total_claims": 42,
        "pending": 8,
        "approved": 28,
        "rejected": 6,
        "avg_risk_score": 75.3,
        "high_risk_count": 15,
        "medium_risk_count": 20,
        "low_risk_count": 7
    }
    """
    try:
        app.logger.info("[API-CLAIMS-STATS] Calculating statistics")
        
        # Fetch all AI claims
        all_claims = get_all_ai_claims()
        ai_claims = [c for c in all_claims if c.get('source') == 'AI_GENERATED']
        
        # Calculate statistics
        total = len(ai_claims)
        pending = len([c for c in ai_claims if c.get('status') == 'PENDING'])
        approved = len([c for c in ai_claims if c.get('status') == 'SENT'])
        rejected = len([c for c in ai_claims if c.get('status') == 'REJECTED'])
        
        # Risk score statistics
        risk_scores = [c.get('risk_score', c.get('ai_confidence', 0)) for c in ai_claims]
        avg_risk = sum(risk_scores) / len(risk_scores) if risk_scores else 0
        high_risk = len([s for s in risk_scores if s >= 71])
        medium_risk = len([s for s in risk_scores if 31 <= s <= 70])
        low_risk = len([s for s in risk_scores if s <= 30])
        
        stats = {
            'total_claims': total,
            'pending': pending,
            'approved': approved,
            'rejected': rejected,
            'approval_rate': round((approved / total * 100) if total > 0 else 0, 2),
            'avg_risk_score': round(avg_risk, 2),
            'high_risk_count': high_risk,
            'medium_risk_count': medium_risk,
            'low_risk_count': low_risk,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        app.logger.info(f"[API-CLAIMS-STATS] Stats: Total={total}, Pending={pending}, Approved={approved}, Rejected={rejected}")
        
        return jsonify({
            'status': 'success',
            'statistics': stats
        }), 200
        
    except Exception as e:
        app.logger.error(f"[API-CLAIMS-STATS] Error: {str(e)}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': f'Error calculating statistics: {str(e)}'
        }), 500


# ═══════════════════════════════════════════════════════════════════════════
# PART 3: TEST & SIMULATION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@app.route('/api/test/simulate-high-risk', methods=['POST'])
def simulate_high_risk_event():
    """
    TESTING ENDPOINT: Simulate a high-risk worker event.
    
    This endpoint allows manual testing of the AI pipeline.
    Use with Postman or curl to test claim auto-generation.
    
    Request Body:
    {
        "worker_id": "TEST-001",
        "user_id": 1,
        "location_lat": 19.076,
        "location_lng": 72.877,
        "scenario": "inactivity" | "danger_zone" | "anomaly" | "combined"
    }
    """
    try:
        data = request.get_json()
        worker_id = data.get('worker_id', 'TEST-WORKER')
        user_id = data.get('user_id', 1)
        location_lat = float(data.get('location_lat', 19.076))
        location_lng = float(data.get('location_lng', 72.877))
        scenario = data.get('scenario', 'combined').lower()
        
        app.logger.info(f"[TEST-SIMULATION] Starting {scenario} scenario for {worker_id}")
        
        # Set parameters based on scenario
        if scenario == 'inactivity':
            inactivity_minutes, has_anomaly, in_danger = 35, False, False
        elif scenario == 'danger_zone':
            inactivity_minutes, has_anomaly, in_danger = 0, False, True
        elif scenario == 'anomaly':
            inactivity_minutes, has_anomaly, in_danger = 0, True, False
        else:  # combined
            inactivity_minutes, has_anomaly, in_danger = 35, True, True
        
        # Process event
        result = process_worker_event(
            worker_id=worker_id,
            user_id=user_id,
            location_lat=location_lat,
            location_lng=location_lng,
            inactivity_minutes=inactivity_minutes,
            has_movement_anomaly=has_anomaly,
            is_in_danger_zone=in_danger
        )
        
        app.logger.info(f"[TEST-SIMULATION] Result: Risk={result.get('risk_score')}, Claim={'YES' if result.get('claim_triggered') else 'NO'}")
        
        return jsonify({
            'status': 'success',
            'test_scenario': scenario,
            'result': result,
            'message': 'Test event processed successfully'
        }), 200
        
    except Exception as e:
        app.logger.error(f"[TEST-SIMULATION] Error: {str(e)}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': f'Error in simulation: {str(e)}'
        }), 500


@app.route('/api/claims/auto-trigger', methods=['POST'])
@token_required
def auto_trigger_claim(user_id, role):
    """Internally called when AI detects high risk and needs to trigger a claim."""
    data = request.json
    
    worker_id = data.get('worker_id')
    risk_score = data.get('risk_score', 75)
    reasons = data.get('reasons', [])
    location_lat = data.get('location_lat', 0)
    location_lng = data.get('location_lng', 0)
    
    # Prevent duplicates
    duplicate = check_duplicate_claim(user_id, time_window_minutes=5)
    if duplicate:
        return jsonify({
            'status': 'success',
            'message': 'Duplicate claim prevented',
            'claim_id': duplicate['claim_id']
        }), 200
    
    import json
    # Create the claim
    claim = create_ai_claim(
        user_id=user_id,
        worker_id=worker_id,
        location_lat=location_lat,
        location_lng=location_lng,
        reason="; ".join(reasons) if isinstance(reasons, list) else reasons,
        distress_condition="AI_EMERGENCY_TRIGGER",
        ai_confidence=min(100, risk_score),
        detection_signals=json.dumps(reasons) if isinstance(reasons, list) else reasons
    )
    
    return jsonify({
        'status': 'success',
        'claim_id': claim['claim_id'],
        'message': 'Emergency claim auto-triggered'
    }), 201



# NOTE: PUT /api/claims/<claim_id>/status removed — use PATCH /api/claims/<claim_id>/status
# The canonical PATCH version (defined above) updates the `claims` table and emits SSE.




@app.route('/api/worker/simulate-emergency', methods=['POST'])
@token_required
def simulate_emergency(user_id, role):
    """Simulate emergency via Agentic AI pipeline for demo purposes."""
    data = request.json if request.json else {}
    location_lat = data.get('location_lat', 20.5937)
    location_lng = data.get('location_lng', 78.9629)
    
    # Route through Agentic AI pipeline
    result = simulate_ai_trigger(
        worker_id=user_id,
        user_id=user_id,
        location_lat=location_lat,
        location_lng=location_lng
    )
    
    if result['status'] == 'error':
        return jsonify(result), 500
    
    return jsonify({
        'status': 'success',
        'message': 'Emergency simulated successfully via AI pipeline',
        'risk_score': result['risk_score'],
        'risk_level': result['risk_level'],
        'ai_status': result['ai_status'],
        'reasons': result['risk_factors'],
        'claim_triggered': result['claim_triggered'],
        'claim_id': result['claim_id']
    }), 200


@app.route('/api/simulate-ai-trigger/<int:worker_id>', methods=['POST'])
@token_required
def simulate_ai_trigger_endpoint(user_id, role, worker_id):
    """Test endpoint to simulate high-risk scenario and force AI claim creation."""
    if role != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin access required'}), 403
    
    data = request.json if request.json else {}
    location_lat = data.get('location_lat', 20.5937)
    location_lng = data.get('location_lng', 78.9629)
    
    # Route through Agentic AI pipeline with maximum risk signals
    result = simulate_ai_trigger(
        worker_id=worker_id,
        user_id=worker_id,
        location_lat=location_lat,
        location_lng=location_lng
    )
    
    if result['status'] == 'error':
        return jsonify(result), 500
    
    return jsonify({
        'status': 'success',
        'message': 'AI trigger test completed',
        'worker_id': worker_id,
        'risk_score': result['risk_score'],
        'risk_level': result['risk_level'],
        'ai_status': result['ai_status'],
        'risk_factors': result['risk_factors'],
        'claim_triggered': result['claim_triggered'],
        'claim_id': result['claim_id'],
        'decision': result['decision'],
        'timestamp': result['timestamp']
    }), 200


# ===================== RAZORPAY PAYMENT INTEGRATION =====================

@app.route('/api/payment/create-order', methods=['POST'])
@token_required
def create_payment_order(user_id, role):
    """
    Create a Razorpay payment order for an APPROVED claim.
    
    Input: { claim_id }
    Output: { order_id, amount, currency, key }
    """
    try:
        from payment_handlers import create_razorpay_order
        from db import get_claim_by_id
        
        data = request.get_json() or {}
        claim_id = data.get('claim_id')
        
        if not claim_id:
            return jsonify({'status': 'error', 'message': 'claim_id required'}), 400
        
        # Fetch claim
        claim = get_claim_by_id(claim_id)
        if not claim:
            return jsonify({'status': 'error', 'message': f'Claim {claim_id} not found'}), 404
        
        # Ensure admin can only pay for APPROVED claims
        if claim['status'] != 'APPROVED':
            return jsonify({
                'status': 'error', 
                'message': f'Only APPROVED claims can be paid. Current status: {claim["status"]}'
            }), 403
        
        # Create Razorpay order
        result = create_razorpay_order(claim_id)
        
        if not result['success']:
            return jsonify({'status': 'error', 'message': result.get('message')}), 500
        
        print(f"[PAYMENT-ORDER] Order created: {result['order_id']} | Amount: {result['amount']} | Claim: {claim_id}", flush=True)
        
        return jsonify({
            'status': 'success',
            'order_id': result['order_id'],
            'amount': result['amount'],
            'currency': result['currency'],
            'key': result['key'],
            'claim_id': claim_id,
            'worker_name': claim.get('worker_name'),
            'message': 'Order created. Complete payment in Razorpay popup.'
        }), 201
    
    except Exception as e:
        print(f"[PAYMENT-ORDER-ERROR] {str(e)}", flush=True)
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/payment/verify', methods=['POST'])
@token_required
def verify_payment(user_id, role):
    """
    Verify Razorpay payment and update claim status to PAID.
    
    Input: { claim_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }
    Output: { status: 'success', claims }
    """
    try:
        from payment_handlers import verify_razorpay_payment
        from db import get_claim_by_id
        
        data = request.get_json() or {}
        claim_id = data.get('claim_id')
        payment_id = data.get('razorpay_payment_id')
        order_id = data.get('razorpay_order_id')
        signature = data.get('razorpay_signature')
        
        if not all([claim_id, payment_id, order_id, signature]):
            return jsonify({
                'status': 'error',
                'message': 'Missing required fields: claim_id, razorpay_payment_id, razorpay_order_id, razorpay_signature'
            }), 400
        
        # Verify payment
        result = verify_razorpay_payment(payment_id, order_id, signature, claim_id)
        
        if not result['success']:
            return jsonify({'status': 'error', 'message': result.get('message')}), 400
        
        # Fetch updated claim
        claim = get_claim_by_id(claim_id)
        
        print(f"[PAYMENT-VERIFIED] Claim {claim_id} marked as PAID | Payment ID: {payment_id}", flush=True)
        
        return jsonify({
            'status': 'success',
            'message': 'Payment verified and claim marked as PAID',
            'claim_id': claim_id,
            'payment_id': payment_id,
            'payment_status': claim.get('payment_status'),
            'claim_status': claim.get('status')
        }), 200
    
    except Exception as e:
        print(f"[PAYMENT-VERIFY-ERROR] {str(e)}", flush=True)
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/claims/<claim_id>/payment-status', methods=['GET'])
@token_required
def get_payment_status(user_id, role, claim_id):
    """Get payment status for a claim."""
    try:
        from db import get_claim_by_id
        
        claim = get_claim_by_id(claim_id)
        if not claim:
            return jsonify({'status': 'error', 'message': f'Claim {claim_id} not found'}), 404
        
        return jsonify({
            'status': 'success',
            'claim_id': claim_id,
            'claim_status': claim.get('status'),
            'payment_status': claim.get('payment_status'),
            'payment_id': claim.get('payment_id'),
            'payout_amount': claim.get('payout_amount'),
            'order_id': claim.get('order_id')
        }), 200
    
    except Exception as e:
        print(f"[PAYMENT-STATUS-ERROR] {str(e)}", flush=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


def generate_demo_claims():
    """Generate demo claims for demonstration purposes."""
    from db import get_all_claims, create_claim, update_claim_with_verdict
    
    try:
        # Check if demo claims already exist
        existing = get_all_claims()
        if len(existing) > 0:
            print(f"[DEMO] {len(existing)} claims already exist, skipping demo generation")
            return
        
        demo_scenarios = [
            {
                'worker_name': 'Ananthi',
                'event_type': 'AUTO',
                'event_source': 'location',
                'description': 'Worker entered flood-prone zone during monsoon season'
            },
            {
                'worker_name': 'Rajesh',
                'event_type': 'MANUAL',
                'event_source': 'weather',
                'description': 'Severe hail storm reported, unable to continue work safely'
            },
            {
                'worker_name': 'Priya',
                'event_type': 'AUTO',
                'event_source': 'network',
                'description': 'Network signal lost, unable to contact emergency services'
            }
        ]
        
        for i, scenario in enumerate(demo_scenarios, 1):
            # Create claim
            worker_id = f'W-{i}'
            result = create_claim(
                worker_id,
                scenario['worker_name'],
                scenario['event_type'],
                scenario['event_source'],
                scenario['description']
            )
            
            if result['success']:
                claim_id = result['claim_id']
                
                # Analyze with AI
                ai_analysis = agentic_ai_analyze_claim(
                    scenario['event_type'],
                    scenario['event_source'],
                    scenario['description']
                )
                
                # Update with verdict
                update_claim_with_verdict(
                    claim_id,
                    ai_analysis['risk_score'],
                    ai_analysis['risk_level'],
                    ai_analysis['ai_confidence'],
                    ai_analysis['ai_verdict'],
                    ai_analysis['ai_reasoning_summary'],
                    ai_analysis['ai_reasoning_factors']
                )
                
                print(f"[DEMO-CLAIM] Created {claim_id} for {scenario['worker_name']} | Verdict: {ai_analysis['ai_verdict']}")
    
    except Exception as e:
        print(f"[DEMO-ERROR] Failed to generate demo claims: {str(e)}")


if __name__ == '__main__':
    # Initialize database
    init_db()
    
    # Generate demo claims for testing
    generate_demo_claims()
    
    # Start Flask server
    app.run(port=5000, debug=False, use_reloader=False)
