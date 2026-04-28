"""
AGENTIC AI SYSTEM FOR AUTONOMOUS CLAIM HANDLING
===============================================

Multi-Agent Architecture:
1. Detection Agent: Monitors worker conditions (GPS, weather, inactivity)
2. Validation Agent: Uses AI reasoning to assess distress signals
3. Claim Agent: Generates and submits autonomous claims

Agents communicate internally via function calls (no external framework).
"""

import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
import os

# Try to use Anthropic for AI reasoning, fallback to rule-based
try:
    from anthropic import Anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

from db import create_ai_claim

anthropic_client = None
if ANTHROPIC_AVAILABLE:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if api_key:
        anthropic_client = Anthropic(api_key=api_key)


# ═══════════════════════════════════════════════════════════════════════════
# PART 1: DETECTION AGENT
# ═══════════════════════════════════════════════════════════════════════════

class DetectionAgent:
    """
    Monitors worker conditions in real-time.
    Evaluates: GPS location, movement pattern, weather, inactivity, network status.
    """
    
    # Thresholds for distress detection
    INACTIVITY_THRESHOLD_MINUTES = 30  # Workers stationary > 30 mins during active task
    MAX_ACCEPTABLE_INACTIVITY = 20     # km/h movement threshold
    
    STORM_KEYWORDS = {
        'thunderstorm', 'tornado', 'squall', 'heavy rain', 'very heavy rain',
        'extreme rain', 'heavy snow', 'precipitation', 'severe weather'
    }
    
    def __init__(self):
        self.name = "WorkerDetectionAgent"
        self.distress_signals = []
    
    def check_for_distress(
        self,
        worker_id: str,
        user_id: int,
        current_lat: float,
        current_lng: float,
        movement_data: Dict,
        weather_data: Dict,
        inactivity_minutes: float = 0,
        network_status: Dict = None
    ) -> Tuple[bool, List[str], int]:
        """
        Evaluate all input signals and determine if worker is in distress.
        
        Returns:
            (is_distress: bool, signals: List[str], confidence: int 0-100)
        """
        
        signals = []
        confidence_score = 0
        
        # SIGNAL 1: CHECK WEATHER CONDITIONS
        if weather_data:
            is_storm = self._check_storm_conditions(weather_data)
            if is_storm:
                signals.append(f"Severe weather detected: {weather_data.get('description', 'Unknown')}")
                confidence_score += 35
        
        # SIGNAL 2: CHECK INACTIVITY DURING ACTIVE TASK
        if inactivity_minutes > self.INACTIVITY_THRESHOLD_MINUTES:
            signals.append(f"Worker stationary for {inactivity_minutes:.1f} minutes during active task")
            confidence_score += 25
        
        # SIGNAL 3: CHECK ABNORMAL MOVEMENT PATTERNS
        movement_risk = self._evaluate_movement_pattern(movement_data, current_lat, current_lng)
        if movement_risk["triggered"]:
            signals.append(movement_risk["reason"])
            confidence_score += movement_risk["score"]
        
        # SIGNAL 4: CHECK NETWORK INSTABILITY
        if network_status:
            network_risk = self._check_network_status(network_status)
            if network_risk["triggered"]:
                signals.append(network_risk["reason"])
                confidence_score += network_risk["score"]
        
        # CAP confidence score
        confidence_score = min(confidence_score, 100)
        
        # Trigger distress if any critical condition met
        is_distress = confidence_score >= 30  # Threshold for intervention
        
        return is_distress, signals, confidence_score
    
    def _check_storm_conditions(self, weather_data: Dict) -> bool:
        """Check if weather conditions indicate storm/heavy rain."""
        description = weather_data.get('description', '').lower()
        condition = weather_data.get('condition', '').lower()
        is_storm = weather_data.get('is_storm', False)
        
        return is_storm or any(keyword in description or keyword in condition for keyword in self.STORM_KEYWORDS)
    
    def _evaluate_movement_pattern(self, movement_data: Dict, lat: float, lng: float) -> Dict:
        """Analyze movement pattern for anomalies."""
        
        if not movement_data:
            return {"triggered": False, "reason": "", "score": 0}
        
        distance_m = movement_data.get('distance_traveled_m', 0)
        duration_s = movement_data.get('duration_seconds', 1)
        
        # Calculate velocity
        velocity_mps = distance_m / max(duration_s, 1)
        velocity_kmh = velocity_mps * 3.6
        
        # Detect sudden stop in risky location
        if velocity_kmh < 0.5 and duration_s > 300:  # Stopped for 5+ mins
            return {
                "triggered": True,
                "reason": f"Abnormal stoppage detected (speed: {velocity_kmh:.2f} km/h)",
                "score": 20
            }
        
        # Detect suspiciously fast movement (>120 km/h)
        if velocity_kmh > 120:
            return {
                "triggered": True,
                "reason": f"Impossible speed detected: {velocity_kmh:.2f} km/h (GPS spoofing suspected)",
                "score": 30
            }
        
        return {"triggered": False, "reason": "", "score": 0}
    
    def _check_network_status(self, network_status: Dict) -> Dict:
        """Evaluate network instability."""
        
        if not network_status:
            return {"triggered": False, "reason": "", "score": 0}
        
        # Check for network switching (indicating possible instability)
        handoff_count = network_status.get('cell_tower_handoffs', 0)
        towers_in_range = network_status.get('towers_nearby', 0)
        
        if towers_in_range == 0:
            return {
                "triggered": True,
                "reason": "No network coverage detected - communication lost",
                "score": 20
            }
        
        if handoff_count > 10:
            return {
                "triggered": True,
                "reason": f"Excessive network switching: {handoff_count} handoffs (possible interference)",
                "score": 15
            }
        
        return {"triggered": False, "reason": "", "score": 0}


# ═══════════════════════════════════════════════════════════════════════════
# PART 2: VALIDATION AGENT
# ═══════════════════════════════════════════════════════════════════════════

class ValidationAgent:
    """
    Validates distress signals using AI reasoning.
    Cross-references against known disaster patterns and contextual data.
    Uses optional RAG (lightweight pattern matching).
    """
    
    # Knowledge base of known distress patterns
    DISTRESS_PATTERNS = [
        {
            "id": "weather_disaster",
            "keywords": ["storm", "thunderstorm", "heavy rain", "flood", "tornado"],
            "severity": "high",
            "description": "Natural disaster in worker vicinity"
        },
        {
            "id": "prolonged_inactivity",
            "keywords": ["stationary", "stuck", "immobilized"],
            "severity": "medium",
            "description": "Worker unable to move or communicate"
        },
        {
            "id": "network_failure",
            "keywords": ["network", "coverage", "communication", "offline"],
            "severity": "medium",
            "description": "Communication infrastructure failure"
        },
        {
            "id": "unsafe_location",
            "keywords": ["risky", "dangerous", "high-risk", "unsafe"],
            "severity": "high",
            "description": "Worker in geographically unsafe location"
        }
    ]
    
    def __init__(self):
        self.name = "ValidationAgent"
    
    def validate_distress_claim(
        self,
        worker_id: str,
        detection_signals: List[str],
        ai_confidence: int,
        weather_context: Dict = None,
        location: Tuple[float, float] = None
    ) -> Dict:
        """
        Validate distress signals and return reasoning for claim generation.
        
        Returns:
            {
                "valid": bool,
                "confidence": int,
                "primary_reason": str,
                "pattern_match": str,
                "rag_context": List[str],
                "recommendation": str
            }
        """
        
        # RAG: Match detection signals against known patterns
        matched_patterns = self._match_patterns(detection_signals)
        
        # AI-powered reasoning (if available)
        if anthropic_client:
            ai_reasoning = self._reasoning_with_ai(detection_signals, matched_patterns, weather_context)
        else:
            ai_reasoning = self._fallback_reasoning(detection_signals, ai_confidence)
        
        return {
            "valid": ai_reasoning["valid"],
            "confidence": ai_reasoning["confidence"],
            "primary_reason": ai_reasoning["primary_reason"],
            "pattern_match": matched_patterns[0]["id"] if matched_patterns else "unknown",
            "rag_context": [p["description"] for p in matched_patterns],
            "recommendation": ai_reasoning["recommendation"]
        }
    
    def _match_patterns(self, signals: List[str]) -> List[Dict]:
        """RAG: Match detection signals against known distress patterns."""
        
        matched = []
        signals_text = " ".join(signals).lower()
        
        for pattern in self.DISTRESS_PATTERNS:
            for keyword in pattern["keywords"]:
                if keyword.lower() in signals_text:
                    matched.append(pattern)
                    break
        
        return matched
    
    def _reasoning_with_ai(self, signals: List[str], patterns: List[Dict], weather: Dict = None) -> Dict:
        """Use Claude AI for intelligent reasoning about distress validity."""
        
        try:
            system_prompt = """You are an insurance claim validation AI. Analyze worker distress signals and determine if autonomous claim generation is justified. Return ONLY valid JSON."""
            
            context = {
                "signals": signals,
                "matched_patterns": [p["id"] for p in patterns],
                "weather_context": weather or {}
            }
            
            user_prompt = f"""Validate this worker distress claim:

Signals: {json.dumps(signals)}
Pattern Matches: {', '.join([p['id'] for p in patterns])}
Weather: {json.dumps(weather or {})}

Return ONLY this JSON:
{{
    "valid": true/false,
    "confidence": <0-100>,
    "primary_reason": "<brief reason>",
    "recommendation": "<approve_claim|hold_for_review|reject>"
}}"""
            
            response = anthropic_client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=200,
                temperature=0.3,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}]
            )
            
            text = response.content[0].text.strip()
            text = text.replace("```json", "").replace("```", "").strip()
            result = json.loads(text)
            
            return {
                "valid": result.get("valid", True),
                "confidence": result.get("confidence", 60),
                "primary_reason": result.get("primary_reason", "AI validation completed"),
                "recommendation": result.get("recommendation", "approve_claim")
            }
        
        except Exception as e:
            print(f"[VALIDATION AGENT] AI error: {e}")
            return self._fallback_reasoning(signals, 60)
    
    def _fallback_reasoning(self, signals: List[str], confidence: int) -> Dict:
        """Fallback rule-based reasoning when AI is unavailable."""
        
        signals_text = " ".join(signals).lower()
        
        # Check for critical keywords
        critical_keywords = ["storm", "flood", "severe", "emergency", "danger"]
        has_critical = any(kw in signals_text for kw in critical_keywords)
        
        if confidence >= 60 and has_critical:
            return {
                "valid": True,
                "confidence": confidence,
                "primary_reason": "Multiple distress signals with high confidence detected",
                "recommendation": "approve_claim"
            }
        elif confidence >= 40:
            return {
                "valid": True,
                "confidence": confidence,
                "primary_reason": "Moderate distress signals warrant claim review",
                "recommendation": "hold_for_review"
            }
        else:
            return {
                "valid": False,
                "confidence": confidence,
                "primary_reason": "Insufficient evidence of distress",
                "recommendation": "reject"
            }


# ═══════════════════════════════════════════════════════════════════════════
# PART 3: CLAIM AGENT (ORCHESTRATOR)
# ═══════════════════════════════════════════════════════════════════════════

class ClaimAgent:
    """
    Autonomous claim orchestrator.
    Receives distress signals, validates them, and generates claims.
    Implements: Detection → Validation → Claim Creation workflow.
    """
    
    def __init__(self):
        self.name = "AutoClaimAgent"
        self.detection_agent = DetectionAgent()
        self.validation_agent = ValidationAgent()
    
    def process_worker_condition(
        self,
        worker_id: str,
        user_id: int,
        location: Tuple[float, float],
        movement_data: Dict = None,
        weather_data: Dict = None,
        inactivity_minutes: float = 0,
        network_status: Dict = None
    ) -> Dict:
        """
        Main entry point: Process worker condition and autonomously generate claim if needed.
        
        Returns:
            {
                "claim_triggered": bool,
                "claim_id": str (if generated),
                "distress_detected": bool,
                "confidence": int,
                "signals": List[str],
                "validation_result": Dict,
                "action_taken": str
            }
        """
        
        # STEP 1: DETECTION - Evaluate all conditions
        is_distress, signals, confidence = self.detection_agent.check_for_distress(
            worker_id=worker_id,
            user_id=user_id,
            current_lat=location[0],
            current_lng=location[1],
            movement_data=movement_data,
            weather_data=weather_data,
            inactivity_minutes=inactivity_minutes,
            network_status=network_status
        )
        
        result = {
            "claim_triggered": False,
            "claim_id": None,
            "distress_detected": is_distress,
            "confidence": confidence,
            "signals": signals,
            "validation_result": None,
            "action_taken": "monitoring"
        }
        
        # STEP 2: VALIDATION - If distress detected, validate it
        if is_distress:
            validation = self.validation_agent.validate_distress_claim(
                worker_id=worker_id,
                detection_signals=signals,
                ai_confidence=confidence,
                weather_context=weather_data,
                location=location
            )
            
            result["validation_result"] = validation
            
            # STEP 3: CLAIM GENERATION - Create claim if validation approves
            if validation["valid"] or validation["recommendation"] in ["approve_claim", "hold_for_review"]:
                claim = self._generate_autonomous_claim(
                    worker_id=worker_id,
                    user_id=user_id,
                    location=location,
                    signals=signals,
                    confidence=confidence,
                    validation=validation
                )
                
                result["claim_triggered"] = True
                result["claim_id"] = claim["claim_id"]
                result["action_taken"] = f"claim_created ({claim['claim_id']})"
                
                return result
        
        return result
    
    def _generate_autonomous_claim(
        self,
        worker_id: str,
        user_id: int,
        location: Tuple[float, float],
        signals: List[str],
        confidence: int,
        validation: Dict
    ) -> Dict:
        """Generate and store autonomous claim."""
        
        reason = validation["primary_reason"]
        distress_condition = validation.get("pattern_match", "undetermined_distress")
        
        # Store detection signals as JSON
        detection_signals_json = json.dumps({
            "detected_signals": signals,
            "rag_context": validation.get("rag_context", []),
            "pattern": validation.get("pattern_match", "unknown")
        })
        
        # Create claim in database
        claim = create_ai_claim(
            user_id=user_id,
            worker_id=worker_id,
            location_lat=location[0],
            location_lng=location[1],
            reason=reason,
            distress_condition=distress_condition,
            ai_confidence=confidence,
            detection_signals=detection_signals_json
        )
        
        return claim


# ═══════════════════════════════════════════════════════════════════════════
# UTILITY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════

def create_claim_orchestrator() -> ClaimAgent:
    """Factory method to create a claim orchestrator."""
    return ClaimAgent()


def process_worker_state_autonomously(
    worker_id: str,
    user_id: int,
    location: Tuple[float, float],
    movement_data: Dict = None,
    weather_data: Dict = None,
    inactivity_minutes: float = 0
) -> Dict:
    """
    High-level interface for autonomous claim processing.
    Call this whenever worker state is updated.
    """
    
    orchestrator = create_claim_orchestrator()
    
    return orchestrator.process_worker_condition(
        worker_id=worker_id,
        user_id=user_id,
        location=location,
        movement_data=movement_data,
        weather_data=weather_data,
        inactivity_minutes=inactivity_minutes
    )
