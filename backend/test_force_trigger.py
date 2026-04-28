import requests

BASE_URL = "http://127.0.0.1:5000"

def test_force_trigger():
    print("--- 5. Testing Debug Force Trigger ---")
    data = {
        "user_id": "123",
        "condition": "storm"
    }
    r = requests.post(f"{BASE_URL}/api/trigger/force", json=data)
    print(f"Status: {r.status_code}")
    print(r.json())
    print()

if __name__ == "__main__":
    test_force_trigger()
