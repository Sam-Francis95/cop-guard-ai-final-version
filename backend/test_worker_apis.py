import requests
import time

BASE_URL = "http://127.0.0.1:5000"
USER_ID = "123"

def test_activate():
    print(f"--- 1. Testing Activate Worker ({USER_ID}) ---")
    data = {
        "user_id": USER_ID,
        "pickup_location": "T Nagar, Chennai",
        "drop_location": "Velachery, Chennai"
    }
    r = requests.post(f"{BASE_URL}/api/worker/activate", json=data)
    print(f"Status: {r.status_code}")
    print(r.json())
    print()

def test_location():
    print(f"--- 2. Testing Location ({USER_ID}) ---")
    r = requests.get(f"{BASE_URL}/api/worker/location/{USER_ID}")
    print(f"Status: {r.status_code}")
    print(r.json())
    print()

def test_trigger_check():
    print(f"--- 3. Testing Rain Trigger Check ({USER_ID}) ---")
    r = requests.get(f"{BASE_URL}/api/trigger/check/{USER_ID}")
    print(f"Status: {r.status_code}")
    print(r.json())
    print()

def test_trigger_status():
    print(f"--- 4. Testing Trigger Status ({USER_ID}) ---")
    r = requests.get(f"{BASE_URL}/api/trigger/status/{USER_ID}")
    print(f"Status: {r.status_code}")
    print(r.json())
    print()

if __name__ == "__main__":
    test_activate()
    test_location()
    
    # Loop trigger check a few times since it's probability based (40% chance total)
    for i in range(3):
        test_trigger_check()
    test_trigger_status()
