import uuid
import random
from datetime import datetime, timedelta

INDIAN_CITIES = [
    {"name": "Chennai", "lat": 13.0827, "lng": 80.2707},
    {"name": "Mumbai", "lat": 19.0760, "lng": 72.8777},
    {"name": "Delhi", "lat": 28.7041, "lng": 77.1025},
    {"name": "Bangalore", "lat": 12.9716, "lng": 77.5946},
    {"name": "Hyderabad", "lat": 17.3850, "lng": 78.4867},
    {"name": "Kolkata", "lat": 22.5726, "lng": 88.3639},
    {"name": "Pune", "lat": 18.5204, "lng": 73.8567}
]

def build_dynamic_claim(claim_type, base_time, offset_minutes, city, exact_coords=None):
    c_id = f"CLM-{random.randint(10000, 99999)}"
    ts = (base_time + timedelta(minutes=offset_minutes)).isoformat() + "Z"
    
    lat = exact_coords["lat"] if exact_coords else round(city["lat"] + random.uniform(-0.02, 0.02), 4)
    lng = exact_coords["lng"] if exact_coords else round(city["lng"] + random.uniform(-0.02, 0.02), 4)
    
    if claim_type == "genuine":
        signals = {
            "accelerometer_variance": round(random.uniform(0.6, 1.5), 2),
            "cell_tower_handoffs": random.randint(3, 10),
            "ambient_noise_db": random.randint(65, 90),
            "battery_level": random.randint(15, 80),
            "network_type": random.choice(["4G", "5G"])
        }
    elif claim_type == "fraud" or claim_type == "syndicate":
        signals = {
            "accelerometer_variance": round(random.uniform(0.00, 0.02), 2),
            "cell_tower_handoffs": 0,
            "ambient_noise_db": random.randint(20, 35),
            "battery_level": random.randint(95, 100),
            "network_type": "WIFI"
        }
        
    return {
        "id": c_id, 
        "worker_id": f"W-{random.randint(2, 11)}",
        "timestamp": ts,
        "gps_coords": {"lat": lat, "lng": lng},
        "signals": signals,
        "environment": {
            "weather_api_data": "Pending Fetch",
            "regional_outage_reported": False
        },
        "gap_finder": {
            "fraud_score": 0, "verdict": "hold", "confidence": "high",
            "q1_gaps": "Pending Analysis", "q2_blindspot": "Pending Analysis",
            "q3_false_positive": "Pending Analysis", "q4_reasoning_audit": "Pending Analysis",
            "worker_report": "Pending Engine Execution", "score_adjustments": 0
        }
    }

def generate_dynamic_claims():
    claims = []
    base_time = datetime.utcnow() - timedelta(hours=2)
    
    # Generate 15 Genuine claims across random cities
    for i in range(15):
        city = random.choice(INDIAN_CITIES)
        claims.append(build_dynamic_claim("genuine", base_time, i*7, city))
        
    # Generate 8 Fraud isolated claims
    for i in range(8):
        city = random.choice(INDIAN_CITIES)
        claims.append(build_dynamic_claim("fraud", base_time, i*13, city))
        
    # Generate 2 Syndicate Clusters (5 claims each within 3 mins same loc)
    for _ in range(2):
        city = random.choice(INDIAN_CITIES)
        cluster_time = datetime.utcnow() - timedelta(minutes=random.randint(10, 60))
        cluster_base_offset = 0 # handled by cluster_time
        exact_lat = round(city["lat"] + random.uniform(-0.02, 0.02), 4)
        exact_lng = round(city["lng"] + random.uniform(-0.02, 0.02), 4)
        
        for i in range(5):
            claims.append(build_dynamic_claim(
                "syndicate", 
                cluster_time, 
                random.uniform(0, 3), # within 3 minutes of each other
                city, 
                exact_coords={"lat": exact_lat, "lng": exact_lng}
            ))

    claims.sort(key=lambda x: x['timestamp'], reverse=True)
    return claims

MOCK_CLAIMS = generate_dynamic_claims()
