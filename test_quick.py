#!/usr/bin/env python3
import requests
import json
import random

BASE_URL = 'http://127.0.0.1:5000'

print('\n=== AUTO DECISION TEST ===\n')

# Generate unique phone (exactly 10 digits)
phone = f"555{random.randint(1000000, 9999999)}"

# Register
print('[1] Registering worker...')
resp = requests.post(f'{BASE_URL}/api/auth/register', json={
    'name': 'Tester', 'age': 30, 'phone': phone, 'password': 'test123'
})
print(f'Status: {resp.status_code}')
if resp.status_code != 201:
    print(f'Error: {resp.json()}')
    exit(1)

# Login
print('\n[2] Logging in...')
resp = requests.post(f'{BASE_URL}/api/auth/login', json={
    'phone': phone, 'password': 'test123'
})
if resp.status_code != 200:
    print(f'Error: {resp.json()}')
    exit(1)
token = resp.json()['token']
print(f'Status: {resp.status_code}')

# Test risk
print('\n[3] Simulating HIGH risk (score=90, confidence=96 → should be APPROVED)...')
headers = {'Authorization': f'Bearer {token}'}
resp = requests.post(f'{BASE_URL}/api/simulate-risk', json={
    'risk_score': 90, 'risk_level': 'HIGH', 'reason': 'Test', 'distress_condition': 'severe'
}, headers=headers)

result = resp.json()
if result.get('claim_generated'):
    claim = result['claim']
    print(f'✅ Claim Created: {claim["claim_id"]}')
    print(f'   Status: {claim["status"]}')
    print(f'   Decision Action: {claim.get("decision_action", "NONE")}')
    print(f'   Risk Score: {claim["risk_score"]}')
    print(f'   AI Confidence: {claim["ai_confidence"]}')
    print(f'\nExpected: status=APPROVED, decision=AUTO_APPROVED')
else:
    print(f'❌ Claim NOT generated')
    print(f'Response: {json.dumps(result, indent=2)}')

print('\n=== TEST COMPLETE ===\n')
