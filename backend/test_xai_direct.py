#!/usr/bin/env python3
"""Direct test of XAI claim generation"""
import sys
sys.path.insert(0, '/f/CopGuardAI/backend')

from app import create_ai_claim, generate_xai_explanation
import json

print("=== TESTING XAI ENGINE DIRECTLY ===\n")

# Test 1: Generate XAI explanation
print("Test 1: Generate XAI Explanation")
xai = generate_xai_explanation(risk_score=85)
print(f"✓ XAI Generated:")
print(f"  Risk Score: {xai['risk_score']}")
print(f"  Factors: {len(xai['factors'])}")
for factor in xai['factors']:
    print(f"    - {factor['name']}: +{factor['impact']} ({factor['severity'].upper()})")
print(f"  Final Reason: {xai['final_reason']}")

# Test 2: Create AI claim with XAI
print("\nTest 2: Create AI Claim with XAI")
try:
    claim_result = create_ai_claim(
        user_id=2,
        worker_id='W-99',
        location_lat=20.5937,
        location_lng=78.9629,
        reason="Test XAI claim",
        distress_condition="TEST",
        ai_confidence=95,
        detection_signals=json.dumps({'test': True}),
        risk_score=85,
        risk_level='HIGH'
    )
    
    print(f"✓ Claim created: {claim_result['claim_id']}")
    print(f"  Status: {claim_result['status']}")
    print(f"  Explanation included: {bool(claim_result.get('explanation'))}")
    
    if claim_result.get('explanation'):
        exp = claim_result['explanation']
        print(f"  Explanation factors: {len(exp['factors'])}")
        print(f"  Final reason: {exp['final_reason']}")
        
except Exception as e:
    print(f"✗ Error creating claim: {e}")
    import traceback
    traceback.print_exc()

print("\n=== TEST COMPLETE ===")
