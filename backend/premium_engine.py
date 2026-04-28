import random

# -----------------------------
# CONFIGURATION (TUNABLE)
# -----------------------------

BASE_PREMIUM = 20

RISK_WEIGHTS = {
    "rain": 0.4,
    "flood": 0.3,
    "aqi": 0.2,
    "traffic": 0.1
}

ZONE_RISK = {
    "chennai": {
        "rain": 0.8,
        "flood": 0.7,
        "aqi": 0.5,
        "traffic": 0.6
    },
    "bangalore": {
        "rain": 0.6,
        "flood": 0.5,
        "aqi": 0.7,
        "traffic": 0.8
    },
    "mumbai": {
        "rain": 0.9,
        "flood": 0.9,
        "aqi": 0.6,
        "traffic": 0.7
    }
}


# -----------------------------
# CORE RISK ENGINE
# -----------------------------

def calculate_risk_score(location):
    location = location.lower()

    if location not in ZONE_RISK:
        # default moderate risk
        zone = {
            "rain": 0.5,
            "flood": 0.5,
            "aqi": 0.5,
            "traffic": 0.5
        }
    else:
        zone = ZONE_RISK[location]

    score = 0
    breakdown = {}

    for factor, weight in RISK_WEIGHTS.items():
        value = zone[factor]

        # small randomness to simulate real-world variability
        variation = random.uniform(-0.05, 0.05)
        adjusted = max(0, min(1, value + variation))

        contribution = adjusted * weight
        score += contribution

        breakdown[factor] = round(contribution, 3)

    final_score = round(score * 100, 2)

    return final_score, breakdown


# -----------------------------
# PREMIUM CALCULATION
# -----------------------------

def calculate_premium(location):
    risk_score, breakdown = calculate_risk_score(location)

    # pricing logic
    premium = BASE_PREMIUM

    if risk_score > 75:
        premium += 15
    elif risk_score > 60:
        premium += 10
    elif risk_score > 40:
        premium += 5
    else:
        premium -= 5

    premium = max(10, premium)

    return {
        "premium": premium,
        "risk_score": risk_score,
        "risk_breakdown": breakdown,
        "explanation": generate_explanation(risk_score, breakdown)
    }


# -----------------------------
# EXPLANATION ENGINE (IMPORTANT)
# -----------------------------

def generate_explanation(score, breakdown):
    reasons = []

    for factor, value in breakdown.items():
        if value > 0.2:
            reasons.append(f"High {factor} risk")

    if score > 70:
        level = "High Risk Zone"
    elif score > 50:
        level = "Moderate Risk Zone"
    else:
        level = "Low Risk Zone"

    return {
        "risk_level": level,
        "key_factors": reasons if reasons else ["Stable conditions"]
    }