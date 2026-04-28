import requests
import json
from datetime import datetime

BASE_URL = "http://127.0.0.1:5000"

def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}")

def test_xai_flow():
    """Test XAI explanation generation in complete flow"""
    log("=== EXPLAINABLE AI (XAI) FLOW TEST ===")
    
    # Step 1: Login
    log("Step 1: Login")
    login_response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"phone": "9998887777", "password": "password123"}
    )
    token = login_response.json().get('token')
    log(f"✓ Token obtained: {token[:20]}...")
    
    # Step 2: Simulate risk (generates claim with XAI)
    log("\nStep 2: Simulate Risk Event")
    risk_response = requests.post(
        f"{BASE_URL}/api/simulate-risk",
        headers={"Authorization": f"Bearer {token}"},
        json={"worker_id": "W-2"}  # Use different worker to avoid duplicate prevention
    )
    risk_data = risk_response.json()
    log(f"✓ Risk Score: {risk_data.get('risk_score')}")
    log(f"✓ Claim Generated: {risk_data.get('claim_generated')}")
    log(f"  Full response: {json.dumps(risk_data, indent=2)}")
    
    if risk_data.get('claim'):
        claim = risk_data['claim']
        log(f"✓ Claim ID: {claim.get('claim_id')}")
        
        # Check for XAI explanation
        if claim.get('explanation'):
            explanation = claim['explanation']
            log(f"\n🧠 XAI EXPLANATION:")
            log(f"   Total Risk Score: {explanation.get('risk_score')}")
            
            factors = explanation.get('factors', [])
            log(f"   Risk Factors: {len(factors)}")
            
            for factor in factors:
                log(f"   - {factor['name']}: +{factor['impact']} ({factor['severity'].upper()})")
                log(f"     → {factor['description']}")
            
            log(f"\n   Final Reason: {explanation.get('final_reason')}")
            log("\n✓ XAI explanation included in response!")
        else:
            log("✗ No XAI explanation in response")
    
    # Step 3: Fetch claims and verify XAI is persisted
    log("\nStep 3: Fetch Claims (verify XAI persisted)")
    import time
    time.sleep(1)
    
    claims_response = requests.get(
        f"{BASE_URL}/api/ai-claims",
        headers={"Authorization": f"Bearer {token}"}
    )
    claims_data = claims_response.json()
    
    if claims_data.get('claims'):
        claim = claims_data['claims'][0]
        log(f"✓ Claim fetched: {claim.get('claim_id')}")
        
        if claim.get('explanation'):
            log(f"✓ XAI explanation persisted in database!")
            explanation = claim['explanation']
            
            factors = explanation.get('factors', [])
            log(f"   Factors count: {len(factors)}")
            
            # Verify total impact matches risk score
            total_impact = sum(f['impact'] for f in factors)
            risk_score = explanation.get('risk_score')
            
            if total_impact == risk_score:
                log(f"✓ Impact validation: {total_impact} == {risk_score} ✓")
            else:
                log(f"⚠ Impact mismatch: {total_impact} != {risk_score}")
        else:
            log("✗ XAI explanation not persisted")
    
    log("\n=== TEST COMPLETE ===")

if __name__ == "__main__":
    test_xai_flow()
