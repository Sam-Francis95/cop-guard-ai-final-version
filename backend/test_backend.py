import requests

BASE_URL = "http://127.0.0.1:5000"

def test_login():
    print("Testing Admin Login...")
    payload = {"email": "admin@copguard.com", "password": "Admin@123"}
    try:
        res = requests.post(f"{BASE_URL}/api/auth/admin/login", json=payload)
        print(f"Status: {res.status_code}")
        print(f"Response: {res.json()}")
        return res.json().get('token')
    except Exception as e:
        print(f"Error: {e}")

def test_subscribe():
    print("\nTesting Subscription...")
    payload = {
        "name": "Test Worker",
        "platform": "Zomato",
        "location": "Chennai"
    }
    try:
        res = requests.post(f"{BASE_URL}/api/insurance/subscribe", json=payload)
        print(f"Status: {res.status_code}")
        print(f"Response: {res.json()}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_login()
    test_subscribe()
