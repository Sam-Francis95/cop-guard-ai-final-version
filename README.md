# CopGuard

CopGuard is an AI-powered parametric insurance fraud detection dashboard.

## 🛡️ Adversarial Defense & Anti-Spoofing Strategy

### The Differentiation
CopGuard detects GPS spoofing through multi-layer behavioural 
fingerprinting. A real delivery worker stranded in a storm zone produces 
physical device signals that no spoofing app running on a stationary home 
device can replicate:
- Accelerometer variance > 0.3g (movement proof — spoofed device shows 0.01g)
- Cell tower handoff frequency — real movement triggers 3–8 handoffs/hour
- Ambient audio dB spike — storm noise registers 70–90dB on device mic
- Battery drain rate — active GPS + movement drains 15–25%/hr vs 2%/hr idle
- Network type switching — real workers roam across towers (4G → 3G → WiFi)

The Gap Finder Engine's Q2 check ("What do I think the worker does 
NOT know I can detect?") explicitly lists which of these signals are 
absent and flags the specific combination that indicates spoofing.

### The Data
Beyond basic GPS coordinates, CopGuard cross-references:
- Device telemetry: accelerometer, gyroscope variance, battery drain
- Network signals: cell tower handoff count, signal strength variance
- Environmental: ambient audio level, weather API for the claim location
- Behavioural: claim submission timing, historical trust score
- Social graph: timing correlation with other nearby claims (syndicate detection)

The Gap Finder Engine's Q1 check ("What gaps are in my knowledge?") 
actively identifies which of these signals are missing or weak for any 
given claim and adjusts the fraud confidence score DOWN proportionally 
before rendering a verdict — preventing incomplete data from triggering 
false positives.

### The UX Balance
CopGuard uses a probabilistic 3-lane verdict system rather than binary 
block/pass:
- Score 0–35 → Auto-approve (instant payout, no friction)
- Score 36–70 → Soft verify (worker submits one photo or OTP)
- Score 71–100 → Human review queue (claim held, not rejected)

The Gap Finder Engine's Q3 ("Where am I going wrong?") and Q4 
("Where am I going wrong in my reasoning?") checkpoints cross-reference 
the regional weather API and network outage database before finalising 
any score. If a storm is confirmed at the worker's location, the score 
is adjusted DOWN by up to 20 points automatically.

Every worker who reaches the Soft Verify or Human Review lane receives 
a plain-English Worker Transparency Report detailing exactly which 
telemetry signals triggered the review — ensuring no honest worker 
is penalised without a clear, contestable explanation.

## Key Features

- Live SOC Dashboard
- Gap Finder Engine Panel
- Syndicate Map
- Worker Transparency Reports

The Gap Finder Engine is inspired by the Gap Finder self-interrogation 
framework — the same 4 critical questions a human investigator asks 
before making a high-stakes decision, now automated and applied to 
every single claim at machine speed.

## 💻 Tech Stack
- Frontend: React, TypeScript, Tailwind CSS v3, Framer Motion, Recharts
- Backend: Python, Flask REST API  
- AI Engine: Anthropic Claude (claude-sonnet-4-6)
- Fraud Logic: Multi-signal device telemetry + social graph analysis
- Weather: OpenWeatherMap API (storm confirmation layer)
