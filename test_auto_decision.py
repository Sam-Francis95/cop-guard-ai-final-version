#!/usr/bin/env python3
"""
Test script for Auto Decision System integration
Tests: Risk simulation → Auto decision applied → Status and decision fields populated
"""

import requests
import json
from datetime import datetime
import random

BASE_URL = "http://127.0.0.1:5000"

def test_auto_decision_flow():
    print("\n" + "="*80)
    print("TEST: Auto Decision System Integration")
    print("="*80)
    
    # Generate unique phone number (exactly 10 digits)
    unique_phone = f"555{random.randint(10000000, 99999999)}"[:10]
    
    # Step 1: Register and login
    print("\n[STEP 1] Registering worker...")
    register_data = {
        "name": "Test Worker",
        "age": 35,
        "phone": unique_phone,
        "password": "password123"
    }
    
    resp = requests.post(f"{BASE_URL}/api/auth/register", json=register_data)
    print(f"Register status: {resp.status_code}")
    if resp.status_code != 201:
        print(f"ERROR: {resp.text}")
        return
    
    # Step 2: Login
    print("\n[STEP 2] Logging in...")
    login_data = {
        "phone": unique_phone,
        "password": "password123"
    }
    
    resp = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
    print(f"Login status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"ERROR: {resp.text}")
        return
    
    login_result = resp.json()
    print(f"Login response: {json.dumps(login_result, indent=2)}")
    token = login_result.get('token')
    worker_id = login_result.get('user_id') or login_result.get('id') or login_result.get('user', {}).get('id')
    print(f"Token: {token[:20] if token else 'NONE'}...")
    print(f"Worker ID: {worker_id}")
    
    # Step 3: Trigger HIGH risk (should auto-generate claim with AUTO_APPROVED decision)
    print("\n[STEP 3] Simulating HIGH risk (risk_score=90, confidence=96)...")
    headers = {"Authorization": f"Bearer {token}"}
    risk_data = {
        "risk_score": 90,
        "risk_level": "HIGH",
        "reason": "Auto Decision Test - Testing APPROVED decision",
        "distress_condition": "extreme"
    }
    
    resp = requests.post(f"{BASE_URL}/api/simulate-risk", json=risk_data, headers=headers)
    print(f"Risk simulation status: {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"ERROR: {resp.json()}")
        return
    
    result = resp.json()
    print(f"\nRisk Simulation Response:")
    print(json.dumps(result, indent=2))
    
    # Check claim generation
    if result.get('claim_generated'):
        print(f"\n✅ Claim Generated: {result['claim']['claim_id']}")
        print(f"   Status: {result['claim']['status']}")
        print(f"   Decision Action: {result['claim'].get('decision_action', 'N/A')}")
        print(f"   Risk Score: {result['claim']['risk_score']}")
        print(f"   AI Confidence: {result['claim']['ai_confidence']}")
    else:
        print(f"\n❌ Claim NOT generated. Condition result: {result.get('condition_result')}")
    
    # Step 4: Fetch claims via API to verify decision data persisted
    print("\n[STEP 4] Fetching claims via /api/ai-claims...")
    resp = requests.get(f"{BASE_URL}/api/ai-claims", headers=headers)
    print(f"Fetch claims status: {resp.status_code}")
    
    if resp.status_code == 200:
        claims = resp.json().get('claims', [])
        print(f"\nFound {len(claims)} claims:")
        
        for claim in claims:
            print(f"\n  Claim ID: {claim['claim_id']}")
            print(f"  Status: {claim['status']}")
            print(f"  Decision Type: {claim.get('decision_type', 'N/A')}")
            print(f"  Decision Action: {claim.get('decision_action', 'N/A')}")
            print(f"  Decided At: {claim.get('decided_at', 'N/A')}")
            print(f"  Risk Score: {claim['risk_score']}")
            print(f"  AI Confidence: {claim['ai_confidence']}")
    else:
        print(f"ERROR: {resp.json()}")
    
    # Step 5: Test different decision scenarios
    print("\n[STEP 5] Testing ESCALATED decision (risk=75, confidence=87)...")
    risk_data = {
        "risk_score": 75,
        "risk_level": "HIGH",
        "reason": "Auto Decision Test - Testing ESCALATED decision",
        "distress_condition": "moderate"
    }
    
    resp = requests.post(f"{BASE_URL}/api/simulate-risk", json=risk_data, headers=headers)
    if resp.status_code == 200:
        result = resp.json()
        if result.get('claim_generated'):
            print(f"✅ Claim Generated: {result['claim']['claim_id']}")
            print(f"   Status: {result['claim']['status']}")
            print(f"   Decision Action: {result['claim'].get('decision_action', 'N/A')}")
    
    # Step 6: Test REJECTED decision (risk=50, confidence=60)
    print("\n[STEP 6] Testing AUTO_REJECTED decision (risk=50, confidence=60)...")
    risk_data = {
        "risk_score": 50,
        "risk_level": "MEDIUM",
        "reason": "Auto Decision Test - Testing REJECTED decision",
        "distress_condition": "mild"
    }
    
    resp = requests.post(f"{BASE_URL}/api/simulate-risk", json=risk_data, headers=headers)
    if resp.status_code == 200:
        result = resp.json()
        if result.get('claim_generated'):
            print(f"✅ Claim Generated: {result['claim']['claim_id']}")
            print(f"   Status: {result['claim']['status']}")
            print(f"   Decision Action: {result['claim'].get('decision_action', 'N/A')}")
    
    print("\n" + "="*80)
    print("TEST COMPLETE")
    print("="*80 + "\n")

if __name__ == '__main__':
    test_auto_decision_flow()
