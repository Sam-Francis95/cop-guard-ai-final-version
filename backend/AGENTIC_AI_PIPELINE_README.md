# Agentic AI Processing Pipeline - Implementation Summary

## Overview
All worker claims are now processed through a Central Agentic AI Engine before appearing in the "AI Autonomous Claims" section. Direct database insertion from workers is eliminated.

## Architecture

### Processing Flow
```
Worker Event (GPS, Inactivity, Anomalies)
    ↓
process_worker_event() [agentic_engine.py]
    ↓
Fetch Worker Historical State
    ↓
Calculate Risk Score (0-100)
    ↓
Risk > 70?
    ├─ YES → Check Duplicates → Create AI Claim (source='AI_GENERATED', status='PENDING')
    └─ NO → Return SAFE status, no claim
    ↓
Dashboard (filters source='AI_GENERATED' only)
```

## Files Created/Modified

### 1. backend/agentic_engine.py (NEW)
Central AI processing engine with comprehensive logging.

**Key Functions:**
- `process_worker_event()`: Main AI processing pipeline
  - Receives: worker_id, user_id, location, risk signals
  - Returns: Processing result with risk score, decision, claim_id
  - Logs: Every step from worker event to claim creation

- `calculate_risk_score()`: Dynamic risk calculation
  - Inactivity (0-40 points)
  - Movement anomaly (0-30 points)
  - Danger zone (0-35 points)
  - Returns: risk_score, risk_level (LOW/MEDIUM/HIGH), ai_status (SAFE/WARNING/CRITICAL), reasons

- `simulate_ai_trigger()`: Test function for high-risk scenarios

**Logging Format:**
```
[TIME] [AGENTIC-ENGINE] [LEVEL] Message
- [WORKER-EVENT]: Worker event received
- [WORKER-STATE]: Fetching/storing risk state
- [AGENTIC-DECISION]: Analyzing signals
- [STATE-UPDATE]: Storing risk calculations
- [CLAIM-DECISION]: AI decision logic
- [DUPLICATE-CHECK]: Preventing duplicate claims
- [CLAIM-CREATION]: Claim created via AI pipeline
- [CLAIM-CREATED]: Claim details logged
- [PROCESSING-COMPLETE]: Full audit trail
```

### 2. backend/db.py (MODIFIED)
Database functions updated to filter AI_GENERATED claims.

**Changes:**
- `create_ai_claim()`: Now explicitly sets status='PENDING', source='AI_GENERATED'
- `get_all_ai_claims()`: Filters WHERE source = 'AI_GENERATED'
- `get_pending_ai_claims()`: Filters WHERE status = 'PENDING' AND source = 'AI_GENERATED'
- `get_claims_by_worker()`: Filters WHERE source = 'AI_GENERATED'

### 3. backend/app.py (MODIFIED)
Routes modified to use agentic pipeline.

**Changes:**
- Import: `from agentic_engine import process_worker_event, simulate_ai_trigger`
- Removed: Duplicate `calculate_risk_score()` function (now in agentic_engine)
- Modified: `/api/worker/<id>/risk/update` → Routes through process_worker_event()
- Modified: `/api/worker/simulate-emergency` → Routes through simulate_ai_trigger()
- Added: `POST /simulate-ai-trigger/<worker_id>` (Admin test endpoint)

## API Endpoints

### 1. Update Worker Risk (Routes through AI Engine)
```
POST /api/worker/<worker_id>/risk/update
Headers: Authorization: Bearer {token}
Body: {
    inactivity_minutes: number,
    has_movement_anomaly: boolean,
    is_in_danger_zone: boolean,
    location_lat: number,
    location_lng: number
}

Response (CLAIM CREATED):
{
    status: "success",
    risk_score: 100,
    risk_level: "HIGH",
    ai_status: "CRITICAL",
    reasons: ["No movement for 30 minutes", "Abnormal movement pattern detected", "Entered unsafe zone"],
    claim_triggered: true,
    claim_id: "AIC-08B5FED87D81",
    decision: "High risk score 100 triggered automatic claim creation",
    message: "Emergency detected. AI initiated insurance claim..."
}

Response (NO CLAIM):
{
    status: "success",
    risk_score: 35,
    risk_level: "MEDIUM",
    ai_status: "WARNING",
    reasons: ["Low activity: 18 minutes"],
    claim_triggered: false,
    claim_id: null,
    decision: "Risk score 35 below threshold. Status: WARNING"
}
```

### 2. Simulate AI Trigger (Admin Test Endpoint)
```
POST /api/simulate-ai-trigger/<worker_id>
Headers: Authorization: Bearer {admin_token}
Body: {
    location_lat: number (optional),
    location_lng: number (optional)
}

Response:
{
    status: "success",
    message: "AI trigger test completed",
    worker_id: 2,
    risk_score: 100,
    risk_level: "HIGH",
    ai_status: "CRITICAL",
    risk_factors: [...],
    claim_triggered: true,
    claim_id: "AIC-9CD3FAD96016",
    decision: "High risk score 100 triggered automatic claim creation",
    timestamp: "2026-04-16T18:12:42.311514"
}
```

### 3. Get AI Autonomous Claims (Dashboard)
```
GET /api/admin/claims
Headers: Authorization: Bearer {admin_token}

Response:
{
    status: "success",
    total: 2,
    claims: [
        {
            claim_id: "AIC-9CD3FAD96016",
            worker_id: "W-3",
            status: "PENDING",
            source: "AI_GENERATED",
            risk_score: 100,
            risk_level: "HIGH",
            ai_status: "CRITICAL",
            reason: "No movement for 30 minutes; Abnormal movement pattern detected; Entered unsafe zone",
            location: { lat: 21.5, lng: 77.5 },
            created_at: "2026-04-16 18:12:42",
            full_name: "Another Worker",
            phone_number: "9911223344",
            ...
        },
        ...
    ]
}
```

### 4. Get Pending AI Claims
```
GET /api/admin/claims/pending
Headers: Authorization: Bearer {admin_token}

Returns only claims with status='PENDING' AND source='AI_GENERATED'
```

## Key Features

### 1. Central Processing Pipeline
- All worker events route through `process_worker_event()`
- No direct claim creation from worker actions
- Validates risk > 70 threshold before claim creation

### 2. Duplicate Prevention
- 5-minute sliding window for duplicate detection
- Prevents claim storms from same worker
- Returns previous claim ID if duplicate detected

### 3. Comprehensive Logging
Each step logged with context:
- Worker event received
- Historical state fetched
- Risk factors analyzed
- Risk score calculated
- Claim creation decision
- Final claim details stored

### 4. Dashboard Isolation
- `source = 'AI_GENERATED'` filters out manual claims
- Only autonomous AI-triggered claims appear in "AI Autonomous Claims"
- Exclusive view of AI agent behavior

### 5. Test Endpoint
Admin can simulate high-risk scenarios:
- POST /simulate-ai-trigger/{worker_id}
- Forces maximum risk signals (inactivity + anomaly + danger zone)
- Verifies AI claim creation works
- Same processing pipeline as real events

## Claim Source Tracking

**Database Field:** `source`
- `'AI_GENERATED'`: Created by agentic AI pipeline (threshold-based)
- `'MANUAL'`: Created by user/admin manually

Dashboard filters:
- Dashboard queries only select source='AI_GENERATED'
- Manual claims stored separately but hidden from autonomous section
- Clear audit trail of claim origin

## Testing Results

### Test 1: High-Risk Event Trigger
```
Input: Worker 2, inactivity=30min, anomaly=true, danger_zone=true
Output: Risk=100, CRITICAL, Claim Created (AIC-08B5FED87D81)
Status: ✓ PASS
```

### Test 2: Duplicate Prevention
```
Input: Same worker within 5 minutes
Output: Risk=100 calculated, duplicate prevented, returned previous claim_id
Status: ✓ PASS
```

### Test 3: Different Worker Test
```
Input: Worker 3 via simulate-ai-trigger
Output: Risk=100, CRITICAL, New Claim Created (AIC-9CD3FAD96016)
Status: ✓ PASS
```

### Test 4: Dashboard Filter
```
Query: GET /api/admin/claims
Output: 2 claims both with source='AI_GENERATED', both PENDING
Status: ✓ PASS
```

## System Stability

✓ No direct DB insertions from workers
✓ All claims flow through AI validation
✓ Duplicate prevention enabled
✓ Comprehensive error handling
✓ Audit logging for compliance
✓ Clear separation between AI and manual claims

## Dependencies

- Python libraries: sqlite3, json, logging, datetime
- Backend framework: Flask
- Database: SQLite with check constraints on status/source
- JWT authentication: Required for all protected endpoints

## Future Enhancements

1. ML-based risk scoring instead of static thresholds
2. Persistent audit log storage
3. Real-time WebSocket updates instead of polling
4. Multi-factor authentication for claim approval
5. Claim lifecycle state machine
6. Integration with external insurance APIs
