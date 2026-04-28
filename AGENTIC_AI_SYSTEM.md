# Agentic AI System for Autonomous Claim Handling

## Overview

CopGuardAI now includes an **Agentic AI Layer** that autonomously monitors worker conditions and generates insurance claims without manual intervention. This system uses a multi-agent architecture to detect distress, validate claims, and manage the insurance workflow.

---

## Architecture

### Three-Agent System

```
┌─────────────────────────────────────────────────────────────────┐
│                    WORKER STATE UPDATES                          │
│         (GPS, Movement, Weather, Inactivity Tracking)            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────────┐
        │   1. DETECTION AGENT                   │
        │  ─ Monitors worker conditions          │
        │  ─ Evaluates: GPS, movement, weather  │
        │  ─ Detects: inactivity, storms, etc.  │
        │  - Returns: distress signals + score   │
        └────────────┬─────────────────────────┘
                     │ If distress_detected
                     ▼
        ┌────────────────────────────────────────┐
        │   2. VALIDATION AGENT                  │
        │  ─ Validates distress signals           │
        │  ─ Uses AI reasoning (Claude)           │
        │  ─ Applies RAG pattern matching         │
        │  - Returns: valid/confidence/reason     │
        └────────────┬─────────────────────────┘
                     │ If valid
                     ▼
        ┌────────────────────────────────────────┐
        │   3. CLAIM AGENT (ORCHESTRATOR)        │
        │  ─ Generates autonomous claim           │
        │  ─ Stores in database                   │
        │  ─ Sends to admin dashboard             │
        │  - Creates: AI claim record             │
        └────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────────────────┐
        │    ADMIN DASHBOARD                      │
        │  ─ Display pending claims               │
        │  ─ Review with full context             │
        │  ─ Approve or Reject                    │
        └────────────────────────────────────────┘
```

---

## System Components

### 1. Backend (`claims_agent.py`)

#### DetectionAgent Class
Monitors real-time worker signals and evaluates distress conditions:

- **Inactivity Detection**: Worker stationary > 30 minutes during active task
- **Weather Analysis**: Storm/heavy rain/flood detection
- **Movement Pattern Analysis**: Detects abnormal speeds (>120 km/h = spoofing)
- **Network Status**: Evaluates connectivity and tower switching

**Key Methods:**
- `check_for_distress()` - Main entry point, returns (distress_flag, signals, confidence)
- `_check_storm_conditions()` - Weather evaluation
- `_evaluate_movement_pattern()` - Speed/movement analysis
- `_check_network_status()` - Network stability check

#### ValidationAgent Class
Validates distress using AI reasoning + RAG pattern matching:

- **Pattern Matching**: RAG-based retrieval of known distress patterns
- **AI Reasoning**: Claude Haiku analyzes signals for validity
- **Recommendation Engine**: approve_claim | hold_for_review | reject

**Key Methods:**
- `validate_distress_claim()` - Validates signals with AI
- `_match_patterns()` - Lightweight RAG implementation
- `_reasoning_with_ai()` - Claude-powered reasoning
- `_fallback_reasoning()` - Rule-based fallback when AI unavailable

#### ClaimAgent Class (Orchestrator)
Coordinates Detection → Validation → Claim Creation workflow:

**Key Methods:**
- `process_worker_condition()` - Main orchestration method
- `_generate_autonomous_claim()` - Creates claim record in database

### 2. Database Extensions (`db.py`)

**New `ai_claims` Table:**
```sql
CREATE TABLE ai_claims (
    id INTEGER PRIMARY KEY,
    claim_id TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    worker_id TEXT NOT NULL,
    timestamp TIMESTAMP,
    location_lat REAL,
    location_lng REAL,
    reason TEXT,
    distress_condition TEXT,
    ai_confidence INTEGER (0-100),
    status TEXT ('pending'/'approved'/'rejected'),
    detection_signals TEXT (JSON),
    admin_notes TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
```

**New Functions:**
- `create_ai_claim()` - Create autonomous claim
- `get_all_ai_claims()` - Retrieve all claims with worker enrichment
- `get_pending_ai_claims()` - Get only pending claims
- `update_ai_claim_status()` - Approve/reject claims
- `get_claims_by_worker()` - Filter claims by worker
- `get_ai_claim_by_id()` - Get single claim details

### 3. API Endpoints (`app.py`)

#### Admin Claims APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/claims` | Get all AI-generated claims |
| GET | `/api/admin/claims/pending` | Get only pending claims |
| GET | `/api/admin/claims/{claim_id}` | Get specific claim details |
| POST | `/api/admin/claims/{claim_id}/approve` | Approve a claim |
| POST | `/api/admin/claims/{claim_id}/reject` | Reject a claim |
| GET | `/api/admin/claims/worker/{worker_id}` | Get claims for specific worker |
| GET | `/api/admin/claims/stats` | Get claims statistics |

**Example Request:**
```bash
# Get all pending claims
curl -H "Authorization: Bearer {token}" \
  http://localhost:5000/api/admin/claims/pending

# Approve a claim
curl -X POST \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Verified distress - heavy rain in area"}' \
  http://localhost:5000/api/admin/claims/CLM-abc123/approve
```

### 4. Frontend Component (`AIClaimsPanel.tsx`)

React component for admin dashboard displaying:

- **Stats Dashboard**: Total, Pending, Approved, Rejected, Approval Rate
- **Filter Tabs**: By status (All/Pending/Approved/Rejected)
- **Claims List**: Interactive card-based view with:
  - Worker info (name, phone, age)
  - Distress condition & confidence score
  - Location coordinates
  - Timestamp
  - Status badge
- **Detail Modal**: Full claim information with:
  - Detection signals analysis
  - RAG context patterns
  - Admin approval/rejection interface
  - Notes field for admin decisions

---

## Workflow Examples

### Example 1: Worker in Storm During Delivery

```
1. DETECTION AGENT
   - Worker GPS: 13.0827, 80.2707 (Chennai)
   - Weather API: "thunderstorm, heavy intensity rain"
   - Movement: Normal (5 km/h)
   - Inactivity: 0 minutes
   
   Result: distress=True, confidence=45
   Signals: ["Severe weather detected: thunderstorm"]

2. VALIDATION AGENT
   - Pattern Match: "weather_disaster" (thunderstorm keyword)
   - AI Reasoning: "Heavy rain + normal movement = worker at risk"
   - Recommendation: approve_claim
   
   Result: valid=True, confidence=45

3. CLAIM AGENT
   - Generate Autonomous Claim
   - Claim ID: AIC-a3f7k9m2q1b5
   - Status: pending
   - Confidence: 45%
   - Reason: "Severe weather detected: thunderstorm"
   
4. ADMIN DASHBOARD
   - Claim appears in "Pending Claims"
   - Admin reviews: Weather confirmed, worker location valid
   - Admin clicks "Approve" with notes: "Heavy rainfall confirmed via OpenWeatherMap API"
   - Claim status → approved
   - Worker notification sent
```

### Example 2: Worker in Prolonged Inactivity

```
1. DETECTION AGENT
   - GPS: Same location for 45 minutes (10km delivery zone)
   - Movement: <0.1 km/h
   - Weather: Clear
   - Inactivity: 45 minutes
   
   Result: distress=True, confidence=70
   Signals: ["Worker stationary for 45.0 minutes during active task"]

2. VALIDATION AGENT
   - Pattern Match: "prolonged_inactivity"
   - AI Reasoning: "45 min inactivity in active task = distress"
   - Recommendation: hold_for_review
   
   Result: valid=True, confidence=70

3. CLAIM AGENT
   - Generate Claim
   - Reason: "Worker stationary for 45.0 minutes during active task"
   - Distress: "prolonged_inactivity"
   - Confidence: 70%

4. ADMIN ACTION
   - Admin sees high confidence inactivity claim
   - Reviews worker profile, delivery route
   - Calls worker: "Delivery vehicle broken down"
   - Approves claim: "Emergency breakdown assistance approved"
```

---

## Input Signals & Thresholds

### Detection Thresholds

| Signal | Threshold | Confidence Contribution |
|--------|-----------|------------------------|
| Severe Weather | Storm conditions | +35% |
| Inactivity | > 30 minutes | +25% |
| Abnormal Movement | Sudden stop | +20% |
| GPU Spoofing | Speed > 120 km/h | +30% |
| Network Failure | 0 towers nearby | +20% |
| Excessive Handoffs | > 10 handoffs | +15% |

### Distress Trigger
- **Claim Generated** when: `confidence_score >= 30%` AND validation passes
- **Hold for Review**: confidence 40-60% with uncertain patterns
- **Auto-Approve**: confidence >= 70% with critical weather/network patterns

---

## Integration with Existing Systems

### Non-Breaking Changes
- ✅ All existing APIs remain unchanged
- ✅ Existing claims/fraud detection continues parallel
- ✅ New database table isolated from existing schema
- ✅ New admin endpoints separate from worker APIs

### Combined with Rain Trigger System
The new Agentic AI operates alongside the existing trigger system:

```python
# Existing rain trigger (continues to work)
TRIGGERED_EVENTS tracking

# New autonomous claims (async processing)
process_worker_state_autonomously() → AI Claims

# Both run independently in worker location polling
```

---

## Customization & Configuration

### Adjusting Detection Thresholds

In `claims_agent.py`, modify DetectionAgent constants:

```python
class DetectionAgent:
    INACTIVITY_THRESHOLD_MINUTES = 30  # Change to 20 for stricter
    MAX_ACCEPTABLE_INACTIVITY = 20     # km/h movement threshold
    
    # Add new storm keywords
    STORM_KEYWORDS = {
        'thunderstorm', 'tornado', 'hail',  # Add 'hail'
        # ...existing keywords
    }
```

### Enabling/Disabling AI Reasoning

The system gracefully degrades if Anthropic API unavailable:

```python
if anthropic_client:
    # Use AI reasoning
    ai_reasoning = self._reasoning_with_ai(...)
else:
    # Fall back to rule-based reasoning
    ai_reasoning = self._fallback_reasoning(...)
```

### Adjusting Validation Confidence

In `ValidationAgent._fallback_reasoning()`:

```python
if confidence >= 60:  # Change to 50 for more aggressive
    return {"valid": True, ...}
```

---

## Deployment Checklist

- [ ] Database migrated with new `ai_claims` table
- [ ] `claims_agent.py` deployed to backend
- [ ] Backend imports updated (`from db import ...`)
- [ ] New API routes tested with admin token
- [ ] Frontend component integrated into Dashboard
- [ ] OPENWEATHERMAP_API_KEY configured (fallback to mock if unavailable)
- [ ] ANTHROPIC_API_KEY configured (graceful fallback if unavailable)
- [ ] Worker location polling tested with agent processing
- [ ] Admin claims endpoints tested (approve/reject workflow)

---

## Monitoring & Logging

### Backend Logs

```
[AUTONOMOUS CLAIM] Generated for worker 5: AIC-a3f7k9m2q1b5
  Signals: ['Severe weather detected: thunderstorm']
  Confidence: 45%

[CLAIM APPROVED] AIC-a3f7k9m2q1b5 by admin 1

[VALIDATION AGENT] AI error: timeout
  Falling back to rule-based reasoning...

[AGENT ERROR] Processing worker 5: Connection refused
```

### Admin Dashboard Insights

- Claims grouped by distress condition
- Approval rate tracking
- Time to approval metrics
- Weather pattern correlation
- Inactivity patterns for UX improvements

---

## Future Enhancements

1. **Multi-Region Weather Integration**: Use multiple weather APIs for redundancy
2. **Predictive Alerts**: Anticipate distress before incidents occur
3. **Worker Preferences**: Allow workers to set sensitivity levels
4. **Appeals System**: Workers can dispute rejected claims
5. **Batch Processing**: Support for large-scale emergency situations
6. **Automated Payouts**: Auto-transfer funds for approved claims above threshold
7. **Historical Analysis**: ML model to improve validation accuracy

---

## Troubleshooting

### Claims Not Generated

**Check:**
1. Worker location polling is active: `GET /api/worker/location/{user_id}`
2. Detection agent thresholds might be too high
3. No weather API response: Check OpenWeatherMap key
4. Database connection: Verify `ai_claims` table exists

### Validation Always Rejecting

1. Set `ValidationAgent` to `hold_for_review` mode for testing
2. Check Claude API key is valid
3. Review fallback reasoning confidence thresholds

### Admin Can't See Claims

1. Verify admin token has `role='admin'`
2. Check database has records: `SELECT COUNT(*) FROM ai_claims;`
3. Browser console for CORS errors
4. API response structure in network tab

---

## API Response Examples

### Get Pending Claims
```json
{
  "status": "success",
  "pending_count": 3,
  "claims": [
    {
      "claim_id": "AIC-a3f7k9m2q1b5",
      "worker_id": "W-5",
      "full_name": "Rajesh Kumar",
      "timestamp": "2024-04-05T14:23:00Z",
      "location": {"lat": 13.0827, "lng": 80.2707},
      "reason": "Severe weather detected: thunderstorm, heavy rain",
      "distress_condition": "weather_disaster",
      "ai_confidence": 45,
      "status": "pending",
      "phone_number": "9876543210",
      "age": 32
    }
  ]
}
```

### Approve Claim Response
```json
{
  "status": "success",
  "message": "Claim approved successfully",
  "claim": {
    "claim_id": "AIC-a3f7k9m2q1b5",
    "status": "approved",
    "admin_notes": "Heavy rainfall confirmed via OpenWeatherMap API",
    "updated_at": "2024-04-05T14:25:30Z"
  }
}
```

### Claims Stats
```json
{
  "status": "success",
  "total_claims": 47,
  "pending": 8,
  "approved": 35,
  "rejected": 4,
  "conditions": {
    "weather_disaster": 23,
    "prolonged_inactivity": 12,
    "network_failure": 8,
    "unsafe_location": 4
  },
  "approval_rate": 89.74
}
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  Dashboard → AIClaimsPanel (React Component)                    │
│  • Displays pending claims                                       │
│  • Admin approve/reject actions                                  │
│  • Stats dashboard                                               │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP(S)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FLASK BACKEND API                             │
│  /api/admin/claims/*                                             │
│  • GET /admin/claims (all claims)                               │
│  • GET /admin/claims/pending (pending only)                     │
│  • POST /admin/claims/{id}/approve                              │
│  • POST /admin/claims/{id}/reject                               │
│  • GET /admin/claims/stats                                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        ▼                                  ▼
┌──────────────────┐          ┌──────────────────────┐
│   SQLite DB      │          │   Agentic AI Layer   │
│                  │          │  (claims_agent.py)   │
│  • ai_claims     │◄─────────┤                      │
│  • users         │          │ 1. DetectionAgent    │
│  • workers       │          │ 2. ValidationAgent   │
│                  │          │ 3. ClaimAgent        │
└──────────────────┘          └──────────────────────┘
                                        │
                        ┌───────────────┴──────────────┐
                        ▼                              ▼
                 ┌─────────────────┐          ┌──────────────────┐
                 │  Weather API    │          │  Claude AI API   │
                 │ (OpenWeatherMap)│          │ (Reasoning/RAG)  │
                 └─────────────────┘          └──────────────────┘
```

