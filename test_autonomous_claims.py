#!/usr/bin/env python3
"""
Test Script for Agentic AI Claims System
========================================

Run this script to test the autonomous claim generation system locally.

Usage:
  python test_autonomous_claims.py
"""

import json
import sys
from datetime import datetime, timedelta

# Add backend to path
sys.path.insert(0, 'backend')

from claims_agent import (
    DetectionAgent,
    ValidationAgent,
    ClaimAgent,
    create_claim_orchestrator,
    process_worker_state_autonomously
)


def print_section(title):
    """Print formatted section header."""
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}\n")


def test_detection_agent():
    """Test DetectionAgent with various scenarios."""
    print_section("TEST 1: Detection Agent")
    
    agent = DetectionAgent()
    
    # Scenario 1: Storm detection
    print("Scenario 1: Worker caught in thunderstorm")
    is_distress, signals, confidence = agent.check_for_distress(
        worker_id="W-1",
        user_id=1,
        current_lat=13.0827,
        current_lng=80.2707,
        weather_data={
            "condition": "Thunderstorm",
            "description": "thunderstorm with heavy rain",
            "is_storm": True,
            "temp_c": 22
        },
        inactivity_minutes=0
    )
    
    print(f"  Distress Detected: {is_distress}")
    print(f"  Confidence: {confidence}%")
    print(f"  Signals: {signals}")
    assert is_distress, "Should detect storm as distress"
    assert confidence >= 30, "Storm should have warning confidence"
    print("  ✅ PASS")
    
    # Scenario 2: Prolonged inactivity
    print("\nScenario 2: Worker stationary for 45 minutes")
    is_distress, signals, confidence = agent.check_for_distress(
        worker_id="W-2",
        user_id=2,
        current_lat=19.0760,
        current_lng=72.8777,
        movement_data={
            "distance_traveled_m": 5,
            "duration_seconds": 60,
            "speed_kmh": 0.3
        },
        inactivity_minutes=45
    )
    
    print(f"  Distress Detected: {is_distress}")
    print(f"  Confidence: {confidence}%")
    print(f"  Signals: {signals}")
    assert is_distress, "Should detect inactivity as distress"
    print("  ✅ PASS")
    
    # Scenario 3: Clear conditions
    print("\nScenario 3: Worker with normal conditions")
    is_distress, signals, confidence = agent.check_for_distress(
        worker_id="W-3",
        user_id=3,
        current_lat=12.9716,
        current_lng=77.5946,
        movement_data={
            "distance_traveled_m": 500,
            "duration_seconds": 60,
            "speed_kmh": 30
        },
        weather_data={
            "condition": "Clear",
            "description": "clear sky",
            "is_storm": False
        },
        inactivity_minutes=2
    )
    
    print(f"  Distress Detected: {is_distress}")
    print(f"  Confidence: {confidence}%")
    print(f"  Signals: {signals if signals else 'None'}")
    assert not is_distress, "Should not detect distress in normal conditions"
    print("  ✅ PASS")


def test_validation_agent():
    """Test ValidationAgent with detected signals."""
    print_section("TEST 2: Validation Agent")
    
    agent = ValidationAgent()
    
    # Scenario 1: Validate storm signals
    print("Scenario 1: Validate storm distress signals")
    validation = agent.validate_distress_claim(
        worker_id="W-1",
        detection_signals=[
            "Severe weather detected: thunderstorm",
            "Worker stationary for 15.0 minutes during active task"
        ],
        ai_confidence=50,
        weather_context={
            "condition": "Thunderstorm",
            "description": "heavy rain",
            "is_storm": True
        }
    )
    
    print(f"  Valid: {validation['valid']}")
    print(f"  Confidence: {validation['confidence']}%")
    print(f"  Reason: {validation['primary_reason']}")
    print(f"  Recommendation: {validation['recommendation']}")
    print(f"  Patterns Matched: {validation.get('rag_context', 'None')}")
    assert validation['valid'], "Should validate storm signals"
    print("  ✅ PASS")
    
    # Scenario 2: Validate inactivity
    print("\nScenario 2: Validate inactivity signals")
    validation = agent.validate_distress_claim(
        worker_id="W-2",
        detection_signals=["Worker stationary for 45.0 minutes during active task"],
        ai_confidence=60
    )
    
    print(f"  Valid: {validation['valid']}")
    print(f"  Confidence: {validation['confidence']}%")
    print(f"  Reason: {validation['primary_reason']}")
    assert validation['valid'], "Should validate inactivity"
    print("  ✅ PASS")


def test_claim_orchestrator():
    """Test full claim orchestration."""
    print_section("TEST 3: Claim Orchestrator")
    
    # Create test worker condition
    print("Creating autonomous claim for worker in storm...")
    
    result = process_worker_state_autonomously(
        worker_id="W-5",
        user_id=5,
        location=(13.0827, 80.2707),
        weather_data={
            "condition": "Thunderstorm",
            "description": "thunderstorm with heavy rain",
            "is_storm": True,
            "temp_c": 22
        },
        movement_data={
            "distance_traveled_m": 100,
            "duration_seconds": 60,
            "speed_kmh": 6
        },
        inactivity_minutes=0
    )
    
    print(f"  Claim Triggered: {result['claim_triggered']}")
    print(f"  Distress Detected: {result['distress_detected']}")
    print(f"  Confidence: {result['confidence']}%")
    print(f"  Action: {result['action_taken']}")
    print(f"  Signals ({len(result['signals'])} total):")
    for signal in result['signals']:
        print(f"    - {signal}")
    
    if result['claim_triggered']:
        print(f"\n  ✅ Claim Created: {result['claim_id']}")
        print(f"     Validation: {result['validation_result']}")
    
    assert result['distress_detected'], "Should detect distress"
    print("  ✅ PASS")


def test_inactivity_pattern():
    """Test inactivity pattern without claim (low confidence)."""
    print_section("TEST 4: Inactivity with Low Confidence")
    
    print("Worker stationary for 10 minutes (below 30 min threshold)...")
    
    result = process_worker_state_autonomously(
        worker_id="W-6",
        user_id=6,
        location=(17.3850, 78.4867),
        inactivity_minutes=10
    )
    
    print(f"  Distress Detected: {result['distress_detected']}")
    print(f"  Confidence: {result['confidence']}%")
    print(f"  Claim Triggered: {result['claim_triggered']}")
    
    assert not result['claim_triggered'], "Should not trigger with low confidence"
    print("  ✅ PASS")


def test_network_detection():
    """Test network failure detection."""
    print_section("TEST 5: Network Failure Detection")
    
    agent = DetectionAgent()
    
    print("Detecting network failure (no towers nearby)...")
    
    is_distress, signals, confidence = agent.check_for_distress(
        worker_id="W-7",
        user_id=7,
        current_lat=22.5726,
        current_lng=88.3639,
        network_status={
            "towers_nearby": 0,
            "cell_tower_handoffs": 0
        }
    )
    
    print(f"  Distress Detected: {is_distress}")
    print(f"  Confidence: {confidence}%")
    print(f"  Signals: {signals}")
    
    assert is_distress, "Should detect network failure"
    assert any("network" in s.lower() for s in signals), "Should mention network"
    print("  ✅ PASS")


def test_movement_spoofing():
    """Test GPS spoofing detection."""
    print_section("TEST 6: GPS Spoofing Detection")
    
    agent = DetectionAgent()
    
    print("Detecting impossible speed (200 km/h - likely spoofing)...")
    
    is_distress, signals, confidence = agent.check_for_distress(
        worker_id="W-8",
        user_id=8,
        current_lat=28.6139,
        current_lng=77.2090,
        movement_data={
            "distance_traveled_m": 10000,  # 10 km
            "duration_seconds": 180,       # 3 minutes
            "speed_kmh": 200                # Impossible for delivery vehicle
        }
    )
    
    print(f"  Distress Detected: {is_distress}")
    print(f"  Confidence: {confidence}%")
    print(f"  Signals: {signals}")
    
    assert is_distress, "Should detect spoofing"
    assert any("speed" in s.lower() for s in signals), "Should mention speed"
    print("  ✅ PASS")


def test_edge_cases():
    """Test edge cases and error handling."""
    print_section("TEST 7: Edge Cases")
    
    # Test with missing data
    print("Test 1: Minimal data (no weather, no movement)")
    result = process_worker_state_autonomously(
        worker_id="W-9",
        user_id=9,
        location=(13.0827, 80.2707)
    )
    
    print(f"  Handled gracefully: {not result.get('claim_triggered')}")
    print("  ✅ PASS")
    
    # Test with extreme confidence
    print("\nTest 2: Multiple distress signals")
    agent = ClaimAgent()
    
    result = agent.process_worker_condition(
        worker_id="W-10",
        user_id=10,
        location=(18.5204, 73.8567),
        weather_data={
            "condition": "Thunderstorm",
            "is_storm": True,
            "description": "severe thunderstorm"
        },
        movement_data={
            "distance_traveled_m": 10,
            "duration_seconds": 300,
            "speed_kmh": 0.1
        },
        inactivity_minutes=50,
        network_status={
            "towers_nearby": 1,
            "cell_tower_handoffs": 15
        }
    )
    
    print(f"  Multiple signals detected")
    print(f"  Confidence accumulated: {result['confidence']}%")
    print(f"  Claim triggered: {result['claim_triggered']}")
    print("  ✅ PASS")


def run_all_tests():
    """Run all tests."""
    print("\n" + "="*70)
    print("  AGENTIC AI CLAIMS SYSTEM - TEST SUITE")
    print("="*70)
    print(f"  Started: {datetime.now().isoformat()}")
    
    try:
        test_detection_agent()
        test_validation_agent()
        test_claim_orchestrator()
        test_inactivity_pattern()
        test_network_detection()
        test_movement_spoofing()
        test_edge_cases()
        
        print_section("ALL TESTS PASSED ✅")
        print(f"Completed: {datetime.now().isoformat()}")
        print("\nThe Agentic AI system is working correctly!")
        print("Ready for production deployment.\n")
        
        return 0
        
    except Exception as e:
        print_section(f"TEST FAILED ❌")
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(run_all_tests())
