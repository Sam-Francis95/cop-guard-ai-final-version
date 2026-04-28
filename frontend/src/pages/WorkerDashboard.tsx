import { useState, useEffect } from 'react';
import { Activity, ShieldAlert, FileText, MapPin, CheckCircle, AlertTriangle, Clock, Zap, AlertCircle } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { getCityFromCoords } from '../utils/geocode';
import AISafetyMonitor from '../components/AISafetyMonitor';
import MyClaimsPanel from '../components/MyClaimsPanel';

// Fix Leaflet icon in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const blueIcon = L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12],
});

export default function WorkerDashboard() {
    const [claims, setClaims] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
    const [myCity, setMyCity] = useState('Locating...');
    const [lastSeen, setLastSeen] = useState<Date | null>(null);
    const [simulatingEmergency, setSimulatingEmergency] = useState(false);
    const [emergencyMessage, setEmergencyMessage] = useState('');
    const [riskAlert, setRiskAlert] = useState<any>(null);
    const [simulatingRisk, setSimulatingRisk] = useState(false);
    const [aiClaims, setAiClaims] = useState<any[]>([]);
    const [newClaimGenerated, setNewClaimGenerated] = useState<any>(null);
    const [claimsLoading, setClaimsLoading] = useState(false);
    // const [claimsError, setClaimsError] = useState('');
    const [expandedXAI, setExpandedXAI] = useState<Set<string>>(new Set());
    const [showClaimForm, setShowClaimForm] = useState(false);
    const [claimFormData, setClaimFormData] = useState({
        issue_type: '',
        description: ''
    });
    const [submittingClaim, setSubmittingClaim] = useState(false);
    const [claimsRefreshKey, setClaimsRefreshKey] = useState(0);

    const [existingQrUrl, setExistingQrUrl] = useState<string | null>(null);
    const [qrFile, setQrFile] = useState<File | null>(null);
    const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
    const [uploadingQr, setUploadingQr] = useState(false);

    useEffect(() => {
        const fetchWorkerQR = async () => {
            const userStr = localStorage.getItem('user');
            if (!userStr) return;
            const user = JSON.parse(userStr);
            if (!user.phone) return;

            try {
                const VITE_API_URL = "http://localhost:5001";
                const workerId = user.phone;
                const res = await fetch(`${VITE_API_URL}/api/workers/${workerId}/qr`);
                if (!res.ok) throw new Error("API failed");
                const data = await res.json();
                setExistingQrUrl(data.qrCodeUrl || null);
            } catch (err) {
                console.error("Could not fetch QR identity", err);
            }
        };
        fetchWorkerQR();
    }, []);

    // Removed inline upload to enforce global QR integrity hook

    const simulateEmergency = async () => {
        try {
            setSimulatingEmergency(true);
            const token = localStorage.getItem('token');
            const userStr = localStorage.getItem('user');
            if (!userStr) return;

            JSON.parse(userStr);

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/api/worker/simulate-emergency`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        location_lat: myPos?.lat || 20.5937,
                        location_lng: myPos?.lng || 78.9629
                    })
                }
            );

            if (response.ok) {
                const data = await response.json();
                setEmergencyMessage(`Emergency Simulated: Claim ${data.claim_id} created with risk score ${data.risk_score}`);
                setTimeout(() => setEmergencyMessage(''), 5000);
            }
        } catch (err) {
            console.error('Error simulating emergency:', err);
            setEmergencyMessage('Failed to simulate emergency');
        } finally {
            setSimulatingEmergency(false);
        }
    };

    // ========== FETCH AI CLAIMS ==========
    const fetchAiClaims = async () => {
        try {
            setClaimsLoading(true);
            // setClaimsError('');
            const token = localStorage.getItem('token');

            console.log('[FETCH-AI-CLAIMS] Starting fetch from /api/ai-claims');

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/api/ai-claims`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const data = await response.json();
            console.log('[FETCH-AI-CLAIMS] Response received:', data);

            if (response.ok && data.status === 'success') {
                // Extract claims array - handle both wrapper and direct array
                const claimsArray = data.claims || [];
                console.log(`[FETCH-AI-CLAIMS] Successfully fetched ${claimsArray.length} claims`);

                // Sort by creation date, newest first
                setAiClaims(claimsArray.sort((a: any, b: any) =>
                    new Date(b.created_at || b.timestamp).getTime() -
                    new Date(a.created_at || a.timestamp).getTime()
                ));
            } else if (response.status === 401 || response.status === 403) {
                console.warn('[FETCH-AI-CLAIMS] Auth error - token may be invalid');
                // setClaimsError('Authentication failed');
            } else {
                console.warn('[FETCH-AI-CLAIMS] Unexpected response:', data);
                setAiClaims([]);
            }
        } catch (err) {
            console.error('[FETCH-AI-CLAIMS] Fetch error:', err);
            // setClaimsError('Failed to fetch AI claims');
            setAiClaims([]);
        } finally {
            setClaimsLoading(false);
        }
    };

    // ========== LIVE RISK DETECTION HANDLER ==========
    const handleSimulateRisk = async () => {
        try {
            setSimulatingRisk(true);
            const token = localStorage.getItem('token');
            const userStr = localStorage.getItem('user');

            if (!userStr) {
                throw new Error('User not found');
            }

            const user = JSON.parse(userStr);
            const workerId = `W-${user.id}`;

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/api/simulate-risk`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ worker_id: workerId })
                }
            );

            if (response.ok) {
                const riskData = await response.json();
                console.log('[RISK-SIMULATION] Received risk data:', riskData);

                // Simulate 1-2 second delay for dramatic effect
                setTimeout(() => {
                    setRiskAlert(riskData);

                    // Show toast notification
                    showRiskNotification(riskData);

                    // ⚡ AUTONOMOUS CLAIM GENERATION
                    // If claim was auto-generated by backend, display it
                    if (riskData.claim_generated && riskData.claim) {
                        console.log('[CLAIM-GENERATED] Backend generated claim:', riskData.claim.claim_id);
                        setNewClaimGenerated(riskData.claim);

                        // Show AI claim notification
                        const claimToast = document.createElement('div');
                        claimToast.className = 'fixed bottom-4 right-4 bg-blue-600 text-white px-6 py-4 rounded-lg shadow-2xl font-bold z-50 animate-bounce border-2 border-blue-400 flex items-center gap-3';
                        claimToast.innerHTML = `
                            <span style="font-size: 24px;">⚡</span>
                            <div>
                                <div style="font-weight: bold;">AI Autonomous Claim Generated</div>
                                <div style="font-size: 12px; margin-top: 4px;">${riskData.claim.claim_id}</div>
                            </div>
                        `;
                        document.body.appendChild(claimToast);

                        setTimeout(() => {
                            claimToast.style.transition = 'opacity 0.5s ease-out';
                            claimToast.style.opacity = '0';
                            setTimeout(() => claimToast.remove(), 500);
                        }, 4000);

                        // 🔄 REFETCH CLAIMS - Wait 2 seconds then fetch updated claims
                        console.log('[CLAIM-FETCH] Scheduling claims refetch in 2 seconds');
                        setTimeout(() => {
                            console.log('[CLAIM-FETCH] Refetching AI claims after risk trigger');
                            fetchAiClaims();
                        }, 2000);
                    } else {
                        console.log('[NO-CLAIM-GENERATED] Risk too low or claim already exists');
                    }

                    // Auto-clear alert after 10 seconds
                    setTimeout(() => setRiskAlert(null), 10000);
                }, 1000);
            } else {
                console.error('Failed to simulate risk:', response.statusText);
            }
        } catch (err) {
            console.error('Error simulating risk:', err);
            alert('Failed to simulate risk event');
        } finally {
            setSimulatingRisk(false);
        }
    };

    const showRiskNotification = (riskData: any) => {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 right-4 bg-red-600 text-white px-6 py-4 rounded-lg shadow-2xl font-bold z-50 animate-pulse border-2 border-red-400 flex items-center gap-3';
        toast.innerHTML = `
            <span style="font-size: 24px;">🔴</span>
            <div>
                <div style="font-weight: bold;">⚠️ HIGH RISK DETECTED</div>
                <div style="font-size: 12px; margin-top: 4px;">${riskData.worker_id} - Risk Score: ${riskData.risk_score}</div>
            </div>
        `;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.transition = 'opacity 0.5s ease-out';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    };

    const toggleXAI = (claimId: string) => {
        setExpandedXAI(prev => {
            const newSet = new Set(prev);
            if (newSet.has(claimId)) {
                newSet.delete(claimId);
            } else {
                newSet.add(claimId);
            }
            return newSet;
        });
    };

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'high': return 'text-red-400 bg-red-950/30';
            case 'medium': return 'text-yellow-400 bg-yellow-950/30';
            case 'low': return 'text-green-400 bg-green-950/30';
            default: return 'text-gray-400 bg-gray-950/30';
        }
    };

    const handleRaiseClaim = async () => {
        try {
            setSubmittingClaim(true);
            const token = localStorage.getItem('token');
            const userStr = localStorage.getItem('user');
            if (!userStr) return;

            const user = JSON.parse(userStr);

            const response = await fetch(
                `http://localhost:5001/api/claims`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        workerPhoneNumber: user.phone || '9998887777', // Strict schema binding
                        workerName: user.name,
                        amount: 100, // Fixed abstract amount for Demo
                        issueType: claimFormData.issue_type || 'GENERAL',
                        description: claimFormData.description,
                        location: {
                            lat: myPos?.lat ?? 0,
                            lng: myPos?.lng ?? 0
                        }
                    })
                }
            );

            if (response.ok) {
                const data = await response.json();
                console.log('[MANUAL-CLAIM] Claim created:', data.claimId);

                // Show success toast
                const claimToast = document.createElement('div');
                claimToast.className = `fixed bottom-4 right-4 ${data.duplicate ? 'bg-orange-600' : 'bg-green-600'} text-white px-6 py-4 rounded-lg shadow-2xl font-bold z-50 animate-bounce`;
                claimToast.innerHTML = `
                    <div>${data.duplicate ? '⚠️ Duplicate Claim Flagged' : '✅ Claim submitted'}: ${data.claimId}</div>
                    <div style="font-size: 12px; margin-top: 4px; opacity: 0.85;">Status: ${data.duplicate ? 'UNDER REVIEW' : 'SENT'} — visible in My Claims</div>
                `;
                document.body.appendChild(claimToast);
                setTimeout(() => claimToast.remove(), 4000);

                // Reset form and close modal
                setClaimFormData({ issue_type: '', description: '' });
                setShowClaimForm(false);

                // Trigger MyClaimsPanel to refetch immediately
                setClaimsRefreshKey(k => k + 1);

                // Also refetch AI claims list
                setTimeout(() => fetchAiClaims(), 1000);
            } else {
                const errData = await response.json().catch(() => ({}));
                console.error('[MANUAL-CLAIM] Error:', errData);
                alert(`Failed to submit claim: ${errData.message || response.statusText}`);
            }
        } catch (err) {
            console.error('Error submitting claim:', err);
            alert('Failed to submit claim. Please check your connection.');
        } finally {
            setSubmittingClaim(false);
        }
    };

    useEffect(() => {
        const fetchMyClaims = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/claims/my`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                setClaims(Array.isArray(data) ? data : []);
                setLoading(false);
            } catch {
                setError('Failed to fetch your data');
                setLoading(false);
            }
        };

        // Fetch AI claims on mount
        console.log('[MOUNT] Fetching AI claims on component mount');
        fetchAiClaims();
        fetchMyClaims();
    }, []);

    // Live location tracking for mini-map
    const updateLocation = () => {
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude: lat, longitude: lng } = pos.coords;
                setMyPos({ lat, lng });
                setLastSeen(new Date());
                const city = await getCityFromCoords(lat, lng);
                setMyCity(city);
            },
            () => setMyCity('Location unavailable')
        );
    };

    useEffect(() => {
        updateLocation();
        const interval = setInterval(updateLocation, 60000);
        return () => clearInterval(interval);
    }, []);

    if (loading) return <div className="p-8 flex items-center text-blue-500"><Activity className="animate-spin mr-3" /> Loading your dashboard...</div>;
    if (error) return <div className="text-red-500 p-8">{error}</div>;

    const latestClaim = claims[0];
    const avgScore = claims.length > 0
        ? Math.round(claims.reduce((acc, c) => acc + (c.gap_finder?.fraud_score || 0), 0) / claims.length)
        : 0;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
            <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-6">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-wide uppercase">Worker Dashboard</h2>
                    <p className="text-gray-400 mt-1">Your personal activity and trust metrics.</p>
                </div>
                <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2 bg-green-500/10 border border-green-500/20 px-4 py-2 rounded-lg">
                        <MapPin className="text-green-500 w-5 h-5" />
                        <span className="text-green-500 font-medium text-sm">Location Services Active</span>
                    </div>
                    <button
                        onClick={simulateEmergency}
                        disabled={simulatingEmergency}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors"
                    >
                        <Zap className="w-4 h-4" />
                        {simulatingEmergency ? 'Simulating...' : 'Simulate Emergency'}
                    </button>
                    <button
                        onClick={handleSimulateRisk}
                        disabled={simulatingRisk}
                        className="bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors animate-pulse"
                    >
                        <AlertCircle className="w-4 h-4" />
                        {simulatingRisk ? 'Detecting...' : '⚠️ Simulate Risk Event'}
                    </button>
                </div>
            </div>

            {emergencyMessage && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                    <span>{emergencyMessage}</span>
                </div>
            )}

            {/* LIVE RISK DETECTION ALERT CARD */}
            {riskAlert && (
                <div className="animate-pulse bg-gradient-to-r from-red-900/50 to-red-800/50 border-4 border-red-500 rounded-xl p-6 shadow-2xl shadow-red-500/50">
                    {/* Animated Header */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="text-4xl animate-bounce">🔴</div>
                            <div>
                                <h2 className="text-2xl font-bold text-red-300">⚠️ HIGH RISK ALERT</h2>
                                <p className="text-red-200 text-sm">{riskAlert.worker_id}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-gray-400 text-xs">Alert Type: {riskAlert.alert_type}</p>
                            <p className="text-gray-500 text-xs">{new Date(riskAlert.timestamp).toLocaleTimeString()}</p>
                        </div>
                    </div>

                    {/* Risk Score Display - Animated */}
                    <div className="bg-red-950 rounded-lg p-4 mb-4 border-l-4 border-red-400">
                        <p className="text-gray-300 text-sm mb-2">Risk Score</p>
                        <div className="text-5xl font-bold text-red-400">{riskAlert.risk_score}
                            <span className="text-2xl text-gray-400">/100</span>
                        </div>
                        <p className="text-red-200 text-sm mt-2 font-semibold">Risk Level: {riskAlert.risk_level}</p>
                    </div>

                    {/* Risk Factors */}
                    <div className="bg-black/40 rounded-lg p-4 border border-red-400/30">
                        <p className="text-red-300 font-bold mb-3 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5" />
                            Risk Factors Detected:
                        </p>
                        <ul className="space-y-2">
                            {riskAlert.reasons.map((reason: string, idx: number) => (
                                <li key={idx} className="text-red-200 text-sm flex items-start gap-2">
                                    <span className="text-red-400 font-bold mt-0.5">▸</span>
                                    {reason}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* AI Confidence Badge */}
                    {riskAlert.ai_confidence && (
                        <div className="mt-4 flex justify-end">
                            <div className="bg-red-600/40 px-4 py-2 rounded-full border border-red-400">
                                <p className="text-red-200 text-xs font-semibold">AI Confidence: {riskAlert.ai_confidence}%</p>
                            </div>
                        </div>
                    )}

                    {/* Claim Generated Indicator */}
                    {riskAlert.claim_generated && riskAlert.claim && (
                        <div className="mt-4 bg-blue-950 border-l-4 border-blue-500 p-3 rounded flex items-start gap-3">
                            <span className="text-blue-400 text-xl">⚡</span>
                            <div>
                                <p className="text-blue-300 font-bold text-sm">AI Autonomous Claim Generated</p>
                                <p className="text-blue-200 text-xs mt-1">{riskAlert.claim.claim_id}</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* AI AUTONOMOUS CLAIMS SECTION */}
            {(aiClaims.length > 0 || newClaimGenerated) && (
                <div className="space-y-4">
                    <h3 className="text-xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <span className="text-2xl">⚡</span> AI Autonomous Claims
                        <span className="ml-2 bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                            {aiClaims.length} Active
                        </span>
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {aiClaims.map((claim: any) => (
                            <div
                                key={claim.claim_id}
                                className={`
                                    transform transition-all duration-500 
                                    ${newClaimGenerated?.claim_id === claim.claim_id ? 'animate-pulse scale-105 border-2 border-blue-400 shadow-lg shadow-blue-500/50' : ''}
                                    bg-gray-900 border border-gray-700 rounded-lg p-4 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/20
                                `}
                            >
                                {/* AI Generated Badge */}
                                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                                    <span className="inline-block bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                                        ⚡ AI GENERATED
                                    </span>
                                    <span className={`
                                        text-xs font-bold px-2 py-1 rounded-full
                                        ${claim.status === 'PENDING' ? 'bg-yellow-600 text-yellow-100' :
                                            claim.status === 'APPROVED' ? 'bg-green-600 text-green-100' :
                                                claim.status === 'SENT' ? 'bg-blue-600 text-blue-100' :
                                                    'bg-red-600 text-red-100'}
                                    `}>
                                        {claim.status || 'PENDING'}
                                    </span>
                                    {claim.decision_action && (
                                        <span className={`
                                            text-xs font-bold px-2 py-1 rounded-full
                                            ${claim.decision_action === 'AUTO_APPROVED' ? 'bg-green-700 text-green-100' :
                                                claim.decision_action === 'ESCALATED_FOR_REVIEW' ? 'bg-orange-700 text-orange-100' :
                                                    'bg-red-700 text-red-100'}
                                        `}>
                                            {claim.decision_action ? claim.decision_action.replace(/_/g, ' ') : 'UNKNOWN'}
                                        </span>
                                    )}
                                </div>

                                {/* Claim ID & Info */}
                                <div className="mb-3 space-y-2">
                                    <p className="text-gray-300 font-semibold text-sm">{claim.claim_id}</p>
                                    <div className="flex items-center justify-between text-xs text-gray-400">
                                        <span>Risk Score:</span>
                                        <span className="text-lg font-bold text-red-400">{claim.risk_score || '—'}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-400">
                                        <span>AI Confidence:</span>
                                        <span className="text-lg font-bold text-blue-400">{claim.ai_confidence || '100'}%</span>
                                    </div>
                                    {claim.decided_at && (
                                        <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-700 pt-2">
                                            <span>Decision Time:</span>
                                            <span className="text-gray-400">{new Date(claim.decided_at).toLocaleTimeString()}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Worker Info */}
                                <div className="bg-gray-800/50 rounded p-2 mb-3 text-xs space-y-1">
                                    <p className="text-gray-300">
                                        <span className="text-gray-500">Worker:</span> {claim.worker_id}
                                    </p>
                                    <p className="text-gray-400 text-xs">
                                        {new Date(claim.created_at || claim.timestamp).toLocaleString()}
                                    </p>
                                </div>

                                {/* Reason */}
                                <div className="bg-blue-950/30 border-l-2 border-blue-500 pl-3 py-2 rounded text-xs text-blue-200 mb-3">
                                    <p className="font-semibold mb-1">Detection Reason:</p>
                                    <p className="text-xs text-gray-300">{claim.reason || 'AI Risk Detection'}</p>
                                </div>

                                {/* AI EXPLANATION (XAI) SECTION */}
                                {claim.explanation && claim.explanation.factors && claim.explanation.factors.length > 0 && (
                                    <div className="mb-3">
                                        {/* XAI Header with Toggle Button */}
                                        <button
                                            onClick={() => toggleXAI(claim.claim_id)}
                                            className="w-full flex items-center justify-between bg-purple-950/40 hover:bg-purple-950/60 border-l-2 border-purple-500 pl-3 py-2 rounded text-xs text-purple-300 font-semibold transition-colors"
                                        >
                                            <span>🧠 AI Explanation</span>
                                            <span className={`transition-transform ${expandedXAI.has(claim.claim_id) ? 'rotate-180' : ''}`}>
                                                ▼
                                            </span>
                                        </button>

                                        {/* Expandable XAI Details */}
                                        {expandedXAI.has(claim.claim_id) && (
                                            <div className="mt-2 space-y-2 bg-purple-950/20 rounded p-3 border border-purple-500/20">
                                                {/* Risk Factors List */}
                                                <div className="space-y-1.5">
                                                    {claim.explanation.factors.map((factor: any, idx: number) => (
                                                        <div key={idx} className="flex items-start gap-2">
                                                            <div className={`flex-shrink-0 w-12 text-right font-bold text-sm ${getSeverityColor(factor.severity)}`}>
                                                                +{factor.impact}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-semibold text-gray-300">{factor.name}</p>
                                                                <p className="text-xs text-gray-400">{factor.description}</p>
                                                                {/* Impact Progress Bar */}
                                                                <div className="mt-1 w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                                                                    <div
                                                                        className={`h-full transition-all ${factor.severity === 'high' ? 'bg-red-500' :
                                                                                factor.severity === 'medium' ? 'bg-yellow-500' :
                                                                                    'bg-green-500'
                                                                            }`}
                                                                        style={{ width: `${(factor.impact / claim.risk_score) * 100}%` }}
                                                                    ></div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Divider */}
                                                <div className="border-t border-purple-500/20 my-2"></div>

                                                {/* Final Reason */}
                                                <div className="bg-purple-900/30 rounded p-2 border-l-2 border-purple-400">
                                                    <p className="text-xs text-purple-200">
                                                        <span className="font-semibold block mb-1">Final Reason:</span>
                                                        {claim.explanation.final_reason}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Action Buttons (demo) */}
                                <div className="flex gap-2">
                                    <button className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-1 px-2 rounded transition-colors">
                                        Approve
                                    </button>
                                    <button className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-1 px-2 rounded transition-colors">
                                        Review
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* NO AI CLAIMS YET - Fallback message */}
            {aiClaims.length === 0 && !newClaimGenerated && !claimsLoading && (
                <div className="bg-blue-900/20 border-2 border-blue-500/30 rounded-lg p-8 text-center">
                    <p className="text-blue-300 text-lg font-medium">
                        <span className="text-3xl block mb-2">⚡</span>
                        No AI-generated claims yet
                    </p>
                    <p className="text-gray-400 text-sm mt-2">
                        Click "Simulate Risk Event" to trigger risk detection and generate an autonomous claim
                    </p>
                </div>
            )}

            {/* LOADING STATE */}
            {claimsLoading && (
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 text-center">
                    <div className="flex items-center justify-center gap-2 text-blue-400">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
                        <span>Loading AI claims...</span>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Fraud Score */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 relative overflow-hidden flex flex-col items-center justify-center min-h-[200px]">
                    <h3 className="text-gray-400 font-medium uppercase text-xs tracking-wider absolute top-6 left-6">My Fraud Risk</h3>
                    <div className="text-5xl font-bold mt-4">
                        <span className={avgScore > 60 ? 'text-red-500' : avgScore > 30 ? 'text-yellow-500' : 'text-green-500'}>
                            {avgScore}
                        </span>
                        <span className="text-gray-600 text-2xl">/100</span>
                    </div>
                    <p className="text-gray-500 text-sm mt-3">Average across {claims.length} claims.</p>
                </div>

                {/* Transparency Report */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 lg:col-span-2">
                    <h3 className="text-gray-400 font-medium uppercase text-xs tracking-wider mb-4 flex items-center">
                        <FileText className="w-4 h-4 mr-2" /> My Transparency Report
                    </h3>
                    {latestClaim && latestClaim.gap_finder ? (
                        <div className="bg-gray-950 rounded-lg p-5 border border-gray-800">
                            <p className="text-sm text-gray-300 leading-relaxed mb-4">
                                <span className="text-blue-400 font-semibold">Latest Verdict: </span>
                                {latestClaim.gap_finder.worker_report || 'Pending automated analysis.'}
                            </p>
                            <div className="space-y-3">
                                <div className="flex items-start">
                                    {latestClaim.gap_finder.fraud_score > 50
                                        ? <AlertTriangle className="w-4 h-4 text-red-500 mr-2 mt-0.5 flex-shrink-0" />
                                        : <CheckCircle className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />}
                                    <p className="text-xs text-gray-400">{latestClaim.gap_finder.q1_gaps}</p>
                                </div>
                                <div className="flex items-start">
                                    <ShieldAlert className="w-4 h-4 text-gray-500 mr-2 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs text-gray-400">{latestClaim.gap_finder.q2_blindspot}</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-gray-500 text-sm py-4">No recent transparency reports available.</div>
                    )}
                </div>
            </div>

            {/* AI Safety Monitor Section */}
            <AISafetyMonitor />

            {/* My Location Mini-Map */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                    <h3 className="text-gray-400 font-medium uppercase text-xs tracking-wider flex items-center">
                        <MapPin className="w-4 h-4 mr-2 text-blue-500" /> My Current Location
                    </h3>
                    {lastSeen && (
                        <span className="text-xs text-gray-500 flex items-center">
                            <Clock className="w-3 h-3 mr-1" />
                            Updated {lastSeen.toLocaleTimeString()}
                        </span>
                    )}
                </div>
                {myPos ? (
                    <>
                        <div style={{ height: 280 }}>
                            <MapContainer
                                center={[myPos.lat, myPos.lng]}
                                zoom={13}
                                style={{ height: '100%', width: '100%' }}
                                zoomControl={false}
                            >
                                <TileLayer
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                />
                                <Marker position={[myPos.lat, myPos.lng]} icon={blueIcon}>
                                    <Popup>📍 You are here</Popup>
                                </Marker>
                            </MapContainer>
                        </div>
                        <div className="px-6 py-4 bg-gray-950 flex items-center justify-between">
                            <div>
                                <p className="text-blue-400 font-semibold text-sm">{myCity}</p>
                                <p className="text-gray-500 text-xs font-mono mt-1">
                                    {myPos.lat.toFixed(5)}, {myPos.lng.toFixed(5)}
                                </p>
                            </div>
                            <div className="flex items-center space-x-2 text-green-400 text-xs font-medium">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                <span>Live Tracking Active</span>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="p-8 text-center text-gray-500 text-sm">
                        <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                        Waiting for GPS signal...
                    </div>
                )}
            </div>

            {/* RAISE MANUAL CLAIM BUTTON */}
            <div className="flex justify-end mb-6">
                <button
                    onClick={() => setShowClaimForm(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-colors shadow-lg hover:shadow-xl"
                >
                    <Zap className="w-5 h-5" />
                    Raise a Claim
                </button>
            </div>

            {/* CLAIM FORM MODAL */}
            {showClaimForm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                <Zap className="w-6 h-6 text-blue-400" />
                                Raise a New Claim
                            </h2>
                            <button
                                onClick={() => setShowClaimForm(false)}
                                className="text-gray-400 hover:text-gray-300 text-xl font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* STRICT QR ENFORCEMENT */}
                            {existingQrUrl ? (
                                <div className="bg-green-950/20 border border-green-900 rounded-lg p-4 mb-4 flex gap-4 items-center">
                                    <img src={existingQrUrl} alt="Active QR" className="h-16 w-16 object-cover rounded border border-green-900/50" />
                                    <div className="flex flex-col flex-1">
                                        <p className="text-green-400 font-bold mb-1 text-sm">Payment destination secured.</p>
                                        <p className="text-xs text-gray-400">Payment will be automatically sent to this QR.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-red-950/20 border border-red-900 rounded-lg p-4 mb-4">
                                    <p className="text-red-400 font-bold mb-1 text-sm">⚠️ Please upload QR in QR Claims page</p>
                                    <p className="text-gray-400 text-xs">You must register a permanent QR payment identity before raising a new claim manually.</p>
                                </div>
                            )}

                            {/* Issue Type Dropdown */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Issue Type</label>
                                <select
                                    value={claimFormData.issue_type}
                                    onChange={(e) => setClaimFormData({ ...claimFormData, issue_type: e.target.value })}
                                    className="w-full bg-gray-950 border border-gray-700 text-gray-100 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                >
                                    <option value="">Select an issue type...</option>
                                    <option value="accident">Accident / Injury</option>
                                    <option value="gps_issue">GPS / Location Issue</option>
                                    <option value="device_malfunction">Device Malfunction</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>

                            {/* Description Textarea */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                                <textarea
                                    value={claimFormData.description}
                                    onChange={(e) => setClaimFormData({ ...claimFormData, description: e.target.value })}
                                    placeholder="Describe the issue in detail..."
                                    rows={5}
                                    className="w-full bg-gray-950 border border-gray-700 text-gray-100 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none"
                                />
                            </div>

                            {/* Form Buttons */}
                            <div className="flex gap-3 pt-4 border-t border-gray-700">
                                <button
                                    onClick={() => {
                                        setClaimFormData({ issue_type: '', description: '' });
                                        setShowClaimForm(false);
                                    }}
                                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 px-4 py-2.5 rounded-lg font-medium transition-colors"
                                    disabled={submittingClaim}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRaiseClaim}
                                    disabled={submittingClaim || !claimFormData.description.trim() || !existingQrUrl}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors relative group"
                                >
                                    {submittingClaim ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        <>
                                            <Zap className="w-4 h-4" />
                                            Submit Claim
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* My Claims Panel with Filters */}
            <MyClaimsPanel refreshKey={claimsRefreshKey} />
        </div>
    );
}
