import json
import logging
import time
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
from db import (
    create_ai_claim, get_worker_risk, upsert_worker_risk, 
    check_duplicate_claim, get_db_connection
)

# Configure logging with more detail
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [PIPELINE] [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# FRAUD DETECTION & RISK SCORING ENGINE
# ═══════════════════════════════════════════════════════════════════════════

class RiskScoringEngine:
    """
    Advanced fraud detection and risk scoring system.
    Evaluates multiple signals and generates risk assessments.
    
    Scoring Rules:
    - No movement > 30 mins → +40 risk
    - Enter unsafe zone → +30 risk
    - Abnormal movement pattern → +20 risk
    - Repeated triggers in short time → +10 risk
    - Rapid location changes → +15 risk
    - After hours activity anomaly → +10 risk
    
    Risk Levels:
    - 0-30: LOW
    - 31-70: MEDIUM
    - 71-100: HIGH (auto-triggers claim)
    """
    
    # Risk thresholds
    INACTIVITY_THRESHOLD_MINUTES = 30  # 30+ mins of no movement
    INACTIVITY_WARNING_MINUTES = 15    # 15-30 mins warning
    UNSAFE_ZONE_PENALTY = 30
    MOVEMENT_ANOMALY_PENALTY = 20
    REPEATED_TRIGGER_PENALTY = 10
    RAPID_LOCATION_PENALTY = 15
    ANOMALY_TIME_PENALTY = 10
    
    # Risk level thresholds
    LOW_THRESHOLD = 30
    MEDIUM_THRESHOLD = 70
    HIGH_THRESHOLD = 71
    
    # Claim auto-trigger threshold
    CLAIM_TRIGGER_SCORE = 70
    
    def __init__(self):
        """Initialize the risk scoring engine."""
        self.worker_history = {}
        logger.info("[RISK-ENGINE] Fraud Detection & Risk Scoring Engine initialized")
    
    def calculate_risk_score(
        self,
        worker_id: str,
        user_id: int,
        inactivity_minutes: int = 0,
        has_movement_anomaly: bool = False,
        is_in_danger_zone: bool = False,
        rapid_location_change: bool = False,
        after_hours: bool = False,
        repeated_trigger: bool = False,
        previous_risk_score: int = 0
    ) -> Tuple[int, str, str, List[str]]:
        """
        Calculate comprehensive risk score based on multiple factors.
        
        Args:
            worker_id: Worker ID
            user_id: User ID
            inactivity_minutes: Minutes of no movement
            has_movement_anomaly: Whether movement pattern is abnormal
            is_in_danger_zone: Whether in unsafe zone
            rapid_location_change: Whether rapid location changes detected
            after_hours: Whether activity during unexpected hours
            repeated_trigger: Whether multiple triggers in short time
            previous_risk_score: Previous risk score for trend analysis
        
        Returns:
            Tuple: (risk_score, risk_level, ai_status, reasons_list)
        """
        logger.info(f"[RISK-CALC] Starting calculation for worker {worker_id} (user_id: {user_id})")
        
        risk = 0
        reasons = []
        
        # ─── FACTOR 1: INACTIVITY (40 points max) ───
        if inactivity_minutes > self.INACTIVITY_THRESHOLD_MINUTES:
            risk += self.INACTIVITY_THRESHOLD_MINUTES
            reasons.append(f"No movement for {inactivity_minutes} minutes (CRITICAL)")
            logger.debug(f"[RISK-CALC] Inactivity CRITICAL: +{self.INACTIVITY_THRESHOLD_MINUTES} points")
        elif inactivity_minutes > self.INACTIVITY_WARNING_MINUTES:
            risk += 20
            reasons.append(f"Low activity: {inactivity_minutes} minutes (WARNING)")
            logger.debug(f"[RISK-CALC] Inactivity WARNING: +20 points")
        
        # ─── FACTOR 2: UNSAFE ZONE ENTRY (30 points) ───
        if is_in_danger_zone:
            risk += self.UNSAFE_ZONE_PENALTY
            reasons.append("Entered unsafe/restricted zone")
            logger.debug(f"[RISK-CALC] Danger zone detected: +{self.UNSAFE_ZONE_PENALTY} points")
        
        # ─── FACTOR 3: ABNORMAL MOVEMENT PATTERN (20 points) ───
        if has_movement_anomaly:
            risk += self.MOVEMENT_ANOMALY_PENALTY
            reasons.append("Abnormal movement pattern detected")
            logger.debug(f"[RISK-CALC] Movement anomaly: +{self.MOVEMENT_ANOMALY_PENALTY} points")
        
        # ─── FACTOR 4: RAPID LOCATION CHANGES (15 points) ───
        if rapid_location_change:
            risk += self.RAPID_LOCATION_PENALTY
            reasons.append("Rapid location changes detected")
            logger.debug(f"[RISK-CALC] Rapid location change: +{self.RAPID_LOCATION_PENALTY} points")
        
        # ─── FACTOR 5: AFTER HOURS ANOMALY (10 points) ───
        if after_hours:
            risk += self.ANOMALY_TIME_PENALTY
            reasons.append("Activity during unexpected hours")
            logger.debug(f"[RISK-CALC] After-hours activity: +{self.ANOMALY_TIME_PENALTY} points")
        
        # ─── FACTOR 6: REPEATED TRIGGERS (10 points) ───
        if repeated_trigger:
            risk += self.REPEATED_TRIGGER_PENALTY
            reasons.append("Multiple risk triggers within short time window")
            logger.debug(f"[RISK-CALC] Repeated triggers: +{self.REPEATED_TRIGGER_PENALTY} points")
        
        # ─── TREND ANALYSIS: Gradual increase ───
        if previous_risk_score > 0:
            risk_increase = risk - previous_risk_score
            if risk_increase > 20:
                logger.warning(f"[RISK-CALC] Risk increased by {risk_increase} points (trend analysis)")
                reasons.append(f"Risk trending upward (+{risk_increase} from previous)")
        
        # Cap at 100
        risk = min(risk, 100)
        logger.debug(f"[RISK-CALC] Risk score capped at 100 (raw: {risk})")
        
        # ─── DETERMINE RISK LEVEL ───
        if risk >= self.HIGH_THRESHOLD:
            risk_level = "HIGH"
            ai_status = "CRITICAL"
        elif risk >= self.MEDIUM_THRESHOLD:
            risk_level = "MEDIUM"
            ai_status = "WARNING"
        elif risk > self.LOW_THRESHOLD:
            risk_level = "ELEVATED"
            ai_status = "ATTENTION"
        else:
            risk_level = "LOW"
            ai_status = "SAFE"
        
        logger.info(f"[RISK-CALC] Final score: {risk} | Level: {risk_level} | Status: {ai_status}")
        logger.info(f"[RISK-CALC] Reasons: {' | '.join(reasons) if reasons else 'None'}")
        
        return risk, risk_level, ai_status, reasons


# Initialize global risk engine
risk_engine = RiskScoringEngine()


def calculate_risk_score(worker_id, user_id, inactivity_minutes=0, has_movement_anomaly=False, is_in_danger_zone=False):
    """
    Wrapper function for backward compatibility.
    Uses the RiskScoringEngine for calculations.
    """
    return risk_engine.calculate_risk_score(
        worker_id, user_id, inactivity_minutes, has_movement_anomaly, is_in_danger_zone
    )


def process_worker_event(worker_id, user_id, location_lat, location_lng, 
                        inactivity_minutes=0, has_movement_anomaly=False, 
                        is_in_danger_zone=False):
    """
    Central AI processing pipeline for worker events.
    
    Process flow:
    1. Receive worker event (GPS, inactivity, anomalies)
    2. Fetch worker's historical risk state
    3. Calculate risk score
    4. Determine if claim should be triggered
    5. Create AI claim if risk > 70
    6. Return decision with full audit trail
    
    Args:
        worker_id: Worker ID
        user_id: User ID in database
        location_lat, location_lng: Current worker location
        inactivity_minutes: Minutes inactive
        has_movement_anomaly: Boolean
        is_in_danger_zone: Boolean
    
    Returns:
        dict with processing result and decision
    """
    logger.info(f"[WORKER-EVENT] Processing event for worker {worker_id}")
    logger.info(f"[WORKER-EVENT] Location: ({location_lat}, {location_lng})")
    logger.info(f"[WORKER-EVENT] Inactivity: {inactivity_minutes}min, Anomaly: {has_movement_anomaly}, DangerZone: {is_in_danger_zone}")
    
    try:
        # Step 1: Fetch previous worker state
        logger.info(f"[WORKER-STATE] Fetching historical risk state for worker {worker_id}")
        previous_risk_data = get_worker_risk(user_id)
        
        if previous_risk_data:
            logger.info(f"[WORKER-STATE] Previous risk: {previous_risk_data['current_risk_score']} ({previous_risk_data['risk_level']})")
        else:
            logger.info(f"[WORKER-STATE] No previous state found - starting fresh")
        
        # Step 2: Calculate risk score using agentic logic
        logger.info(f"[AGENTIC-DECISION] Analyzing worker signals...")
        risk_score, risk_level, ai_status, reasons = calculate_risk_score(
            worker_id, user_id,
            inactivity_minutes, has_movement_anomaly, is_in_danger_zone
        )
        
        # Step 3: Update worker risk state in database
        logger.info(f"[STATE-UPDATE] Storing risk state: {risk_score} ({risk_level}/{ai_status})")
        upsert_worker_risk(user_id, risk_score, risk_level, ai_status, json.dumps(reasons))
        
        # Step 4: Determine claim trigger decision
        claim_created = False
        claim_id = None
        decision_reason = ""
        
        if risk_score > 70:
            logger.warning(f"[CLAIM-DECISION] Risk score {risk_score} exceeds threshold (70)")
            
            # Check for duplicate claims
            logger.info(f"[DUPLICATE-CHECK] Checking for duplicate claims within 5-minute window...")
            duplicate = check_duplicate_claim(user_id, time_window_minutes=5)
            
            if duplicate:
                logger.warning(f"[CLAIM-DECISION] Duplicate claim prevented. Previous claim: {duplicate['claim_id']}")
                decision_reason = f"Duplicate prevention: recent claim {duplicate['claim_id']}"
                claim_created = False
                claim_id = duplicate['claim_id']
            else:
                # Step 5: Create AI-generated claim through formal pipeline
                logger.info(f"[CLAIM-CREATION] AI decision: CREATE CLAIM")
                logger.info(f"[CLAIM-CREATION] Trigger reason: High risk score {risk_score}")
                logger.info(f"[CLAIM-CREATION] Risk factors: {', '.join(reasons)}")
                
                claim = create_ai_claim(
                    user_id=user_id,
                    worker_id=f"W-{worker_id}",
                    location_lat=location_lat,
                    location_lng=location_lng,
                    reason="; ".join(reasons),
                    distress_condition="HIGH_RISK_DETECTED",
                    ai_confidence=min(100, risk_score),
                    detection_signals=json.dumps(reasons)
                )
                
                claim_created = True
                claim_id = claim['claim_id']
                decision_reason = f"High risk score {risk_score} triggered automatic claim creation"
                
                logger.info(f"[CLAIM-CREATED] Claim ID: {claim_id}")
                logger.info(f"[CLAIM-CREATED] Source: AI_GENERATED")
                logger.info(f"[CLAIM-CREATED] Status: PENDING")
                logger.info(f"[CLAIM-CREATED] Confidence: {min(100, risk_score)}%")
        else:
            logger.info(f"[CLAIM-DECISION] Risk score {risk_score} below threshold (70) - No claim triggered")
            decision_reason = f"Risk score {risk_score} below threshold. Status: {ai_status}"
        
        # Step 6: Return full audit trail
        result = {
            'status': 'success',
            'worker_id': worker_id,
            'user_id': user_id,
            'timestamp': datetime.utcnow().isoformat(),
            'risk_score': risk_score,
            'risk_level': risk_level,
            'ai_status': ai_status,
            'risk_factors': reasons,
            'claim_triggered': claim_created,
            'claim_id': claim_id,
            'decision': decision_reason,
            'location': {
                'lat': location_lat,
                'lng': location_lng
            }
        }
        
        logger.info(f"[PROCESSING-COMPLETE] Event processed - Decision: {'CLAIM_CREATED' if claim_created else 'NO_ACTION'}")
        return result
        
    except Exception as e:
        logger.error(f"[PROCESSING-ERROR] Error processing worker event: {str(e)}", exc_info=True)
        return {
            'status': 'error',
            'worker_id': worker_id,
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }


def simulate_ai_trigger(worker_id, user_id, location_lat=0.0, location_lng=0.0):
    """
    Simulate high-risk scenario for testing AI agentic behavior.
    
    Forces AI to calculate max risk and trigger claim creation.
    """
    logger.info(f"[TEST-SIMULATION] Simulating high-risk scenario for worker {worker_id}")
    
    return process_worker_event(
        worker_id=worker_id,
        user_id=user_id,
        location_lat=location_lat,
        location_lng=location_lng,
        inactivity_minutes=30,  # High inactivity
        has_movement_anomaly=True,  # Anomaly detected
        is_in_danger_zone=True  # In danger zone
    )


def get_ai_processing_log():
    """
    Retrieve recent AI processing decisions for debugging.
    """
    logger.info(f"[DEBUG] Retrieving AI processing history")
    return {
        'timestamp': datetime.utcnow().isoformat(),
        'message': 'AI processing history would be stored in centralized log system'
    }
