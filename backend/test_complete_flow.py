import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "http://127.0.0.1:5000"
API_KEY = "test123"

# Test user credentials
TEST_USER = {
    "phone": "9998887777",
    "password": "password123"
}

def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}")

def test_login():
    """Test login and get JWT token"""
    log("=== TESTING LOGIN ===")
    url = f"{BASE_URL}/api/auth/login"
    payload = TEST_USER
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        log(f"Status: {response.status_code}")
        data = response.json()
        
        if response.status_code == 200:
            token = data.get('token')
            log(f"✓ Login successful - Token: {token[:20]}...")
            return token
        else:
            log(f"✗ Login failed: {data}")
            return None
    except Exception as e:
        log(f"✗ Error: {e}")
        return None

def test_fetch_ai_claims(token):
    """Fetch AI claims"""
    log("=== FETCHING AI CLAIMS ===")
    url = f"{BASE_URL}/api/ai-claims"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.get(url, headers=headers)
        log(f"Status: {response.status_code}")
        data = response.json()
        
        if response.status_code == 200:
            log(f"Response status: {data.get('status')}")
            log(f"Total claims: {data.get('total')}")
            claims = data.get('claims', [])
            log(f"Claims count: {len(claims)}")
            
            if claims:
                for claim in claims:
                    log(f"  - {claim.get('claim_id')}: Status={claim.get('status')}, Worker={claim.get('worker_id')}")
            else:
                log("  No claims found")
            
            return claims
        else:
            log(f"✗ Failed: {data}")
            return []
    except Exception as e:
        log(f"✗ Error: {e}")
        return []

def test_simulate_risk(token, worker_id="W-1"):
    """Simulate risk event"""
    log("=== SIMULATING RISK ===")
    url = f"{BASE_URL}/api/simulate-risk"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = {"worker_id": worker_id}
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        log(f"Status: {response.status_code}")
        data = response.json()
        
        if response.status_code == 200:
            log(f"✓ Risk simulated - Score: {data.get('risk_score')}, Level: {data.get('risk_level')}")
            claim_generated = data.get('claim_generated', False)
            log(f"Claim generated: {claim_generated}")
            
            if claim_generated and data.get('claim'):
                claim = data.get('claim')
                log(f"  - Claim ID: {claim.get('claim_id')}")
                log(f"  - Status: {claim.get('status')}")
                log(f"  - AI Confidence: {claim.get('ai_confidence')}")
            
            return data
        else:
            log(f"✗ Failed: {data}")
            return None
    except Exception as e:
        log(f"✗ Error: {e}")
        return None

def main():
    log("Starting API test flow...")
    
    # Step 1: Login
    token = test_login()
    if not token:
        log("Failed to get token, aborting")
        sys.exit(1)
    
    log("")
    
    # Step 2: Fetch initial claims
    initial_claims = test_fetch_ai_claims(token)
    initial_count = len(initial_claims)
    log(f"Initial claims: {initial_count}")
    
    log("")
    
    # Step 3: Simulate risk - Use W-1 (primary test user)
    test_simulate_risk(token, worker_id="W-1")
    
    log("")
    
    # Step 4: Fetch claims again
    log("Waiting 2 seconds...")
    import time
    time.sleep(2)
    
    final_claims = test_fetch_ai_claims(token)
    final_count = len(final_claims)
    log(f"Final claims: {final_count}")
    
    log("")
    log("=== TEST SUMMARY ===")
    if final_count > initial_count:
        log(f"✓ SUCCESS: New claim generated! ({initial_count} -> {final_count})")
    else:
        log(f"✗ FAILURE: No new claims generated (expected {initial_count + 1}, got {final_count})")

if __name__ == "__main__":
    main()
