import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Activity, MapPin, Clock, ShieldAlert, ArrowRight } from 'lucide-react';
import { getCityFromCoords } from '../utils/geocode';

// Fix Leaflet default icon paths broken by Vite's build process
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface WorkerLocation {
    worker_id: string;
    full_name: string;
    age: number;
    phone_number: string;
    gps: { lat: number; lng: number } | null;
    last_seen: string | null;
    fraud_score: number | null;
    verdict: string | null;
    city?: string;
    trigger?: boolean;
    condition?: string;
    risk_score?: number;
    ai?: {
        fraud_score: number;
        risk_level: string;
        trigger: boolean;
        reason: string;
    };
}

const getRiskColor = (score: number | null): string => {
    if (!score || score === 0) return '#6b7280'; // gray
    if (score <= 35) return '#22c55e'; // green
    if (score <= 70) return '#f97316'; // orange
    return '#ef4444'; // red
};

const getRiskLabel = (score: number | null): string => {
    if (!score || score === 0) return 'Clear';
    if (score <= 35) return 'Safe';
    if (score <= 70) return 'Med Risk';
    return 'High Risk';
};

// ADD: risk_score-aware color (used for both fraud_score and backend risk_score)
const getRiskScoreColor = (score: number | null | undefined): string => {
    if (score == null) return '#6b7280';
    if (score <= 35) return '#22c55e';  // green
    if (score <= 70) return '#f59e0b';  // yellow
    return '#ef4444';                    // red
};

const getRiskScoreLabel = (score: number | null | undefined): string => {
    if (score == null) return 'Unknown';
    if (score <= 35) return 'Safe';
    if (score <= 70) return 'Medium';
    return 'High';
};

// MODIFY: use risk_score (from debug API) for color; fallback to fraud_score
const createDivIcon = (score: number | null, isTriggered: boolean = false, riskScore?: number) => {
    // Priority: isTriggered → red. Else use risk_score, else fraud_score color.
    const color = isTriggered ? '#ef4444' : getRiskScoreColor(riskScore ?? score);
    const animationStyle = isTriggered ? 'animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;' : '';
    
    return L.divIcon({
        className: '',
        html: `
        <style>
            @keyframes pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.3); opacity: 0.8; }
            }
        </style>
        <div style="
            width:20px; height:20px; border-radius:50%;
            background:${color}; border:3px solid white;
            box-shadow:0 2px 8px rgba(0,0,0,0.5);
            ${animationStyle}
        "></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -14],
    });
};

function FlyTo({ target }: { target: [number, number] | null }) {
    const map = useMap();
    useEffect(() => {
        if (target) map.flyTo(target, 13, { duration: 1.5 });
    }, [target, map]);
    return null;
}

export default function LiveMap() {
    const [workers, setWorkers] = useState<WorkerLocation[]>([]);
    const [syndicates, setSyndicates] = useState<{ loc: string; count: number }[]>([]);
    const [loading, setLoading] = useState(true);
    const [countdown, setCountdown] = useState(60);
    const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
    const markerRefs = useRef<Record<string, L.Marker | null>>({});
    const navigate = useNavigate();

    const fetchAll = async () => {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        try {
            const [wRes, sRes] = await Promise.all([
                fetch(`${import.meta.env.VITE_API_URL}/api/workers/locations`, { headers }),
                fetch(`${import.meta.env.VITE_API_URL}/api/syndicate`, { headers }),
            ]);
            const wData = await wRes.json();
            const sRaw = await sRes.json();

            const enriched: WorkerLocation[] = await Promise.all(
                (wData.workers || []).map(async (w: WorkerLocation) => {
                    const wIdNum = w.worker_id.replace('W-', '');

                    // Default AI data for inactive workers
                    w.ai = {
                        fraud_score: 0,
                        risk_level: 'low',
                        trigger: false,
                        reason: 'Awaiting activation'
                    };

                    // STEP 1 & 2: Call /api/debug/full-status for live location + trigger + risk_score
                    try {
                        const debugRes = await fetch(`${import.meta.env.VITE_API_URL}/api/debug/full-status/${wIdNum}`, { headers });
                        if (debugRes.ok) {
                            const debugData = await debugRes.json();
                            // Merge location
                            if (debugData.location?.lat && debugData.location?.lng) {
                                w.gps = { lat: debugData.location.lat, lng: debugData.location.lng };
                            }
                            // Merge trigger + risk_score
                            const ai = debugData.trigger_check;
                            w.trigger = ai?.trigger || false;
                            w.risk_score = ai?.fraud_score || 0;
                            w.condition = w.trigger ? 'rain' : 'clear';
                            // Map AI data
                            if (debugData.ai) {
                                w.ai = {
                                    fraud_score: debugData.ai.fraud_score,
                                    risk_level: debugData.ai.risk_level,
                                    trigger: debugData.ai.trigger,
                                    reason: debugData.ai.reason
                                };
                            }
                        }
                    } catch (_) {
                        // Worker exists but not actively simulated - keep default AI data
                        if (!w.gps) {
                            w.gps = { lat: 20.5937, lng: 78.9629 };
                        }
                    }

                    if (w.gps) w.city = await getCityFromCoords(w.gps.lat, w.gps.lng);
                    else w.city = 'No GPS data';
                    return w;
                })
            );
            setWorkers(enriched);

            const clusters = (sRaw || []).map((s: any[]) => ({
                loc: s[0] as string,
                count: (s[1] as any[]).length,
            }));
            setSyndicates(clusters);
        } catch (e) {
            console.error('LiveMap fetch error:', e);
        } finally {
            setLoading(false);
            setCountdown(60);
        }
    };

    useEffect(() => {
        fetchAll();
        const dataTimer = setInterval(fetchAll, 3000); // Poll every 3 seconds for active simulation
        return () => clearInterval(dataTimer);
    }, []);

    useEffect(() => {
        const tick = setInterval(() => setCountdown(c => (c > 1 ? c - 1 : 60)), 1000);
        return () => clearInterval(tick);
    }, []);

    const focusWorker = (w: WorkerLocation) => {
        if (!w.gps) return;
        const pos: [number, number] = [w.gps.lat, w.gps.lng];
        setFlyTarget(prev => (prev && prev[0] === pos[0] && prev[1] === pos[1] ? null : pos));
        setTimeout(() => {
            markerRefs.current[w.worker_id]?.openPopup();
        }, 1600);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
                <Activity className="animate-spin mr-3 w-6 h-6" />
                Loading Live Tracking Matrix...
            </div>
        );
    }

    if (workers.length === 0) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400 text-xl font-semibold">
                No active workers
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100%', backgroundColor: '#030712', overflow: 'hidden' }}>

            {/* ── Map Area ── */}
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>

                {/* Top-left label */}
                <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 1000 }}
                    className="bg-gray-900/90 border border-gray-800 rounded-lg px-4 py-3 shadow-xl backdrop-blur-sm">
                    <h1 className="text-lg font-bold text-white flex items-center">
                        <MapPin className="text-blue-500 mr-2 w-5 h-5" /> Live Workforce Map
                    </h1>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {workers.filter(w => w.gps).length} of {workers.length} workers broadcasting
                    </p>
                </div>

                {/* Countdown timer */}
                <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 1000 }}
                    className="bg-gray-900/90 border border-gray-800 rounded-lg px-4 py-2 shadow-xl flex items-center space-x-2">
                    {countdown === 60 ? (
                        <><Activity className="w-4 h-4 text-blue-400 animate-spin" /><span className="text-sm text-blue-400 font-bold">Refreshing...</span></>
                    ) : (
                        <><Clock className="w-4 h-4 text-gray-500" /><span className="text-sm font-mono text-gray-300">Next update in {countdown}s</span></>
                    )}
                </div>

                {/* Risk legend */}
                <div style={{ position: 'absolute', bottom: 24, left: 16, zIndex: 1000 }}
                    className="bg-gray-900/90 border border-gray-800 rounded-lg px-4 py-3 shadow-xl space-y-1.5">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-2">Risk Legend</p>
                    {[['#22c55e', 'Low (0–35)'], ['#f97316', 'Medium (36–70)'], ['#ef4444', 'High (71–100)'], ['#6b7280', 'No Claims']].map(([c, l]) => (
                        <div key={l} className="flex items-center space-x-2">
                            <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: c, border: '2px solid white' }} />
                            <span className="text-xs text-gray-300">{l}</span>
                        </div>
                    ))}
                </div>

                <MapContainer
                    center={[20.5937, 78.9629]}
                    zoom={5}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={true}
                >
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    <FlyTo target={flyTarget} />

                    {/* Syndicate circles */}
                    {syndicates.map((s, i) => {
                        const [latS, lngS] = s.loc.split(',').map(Number);
                        return (
                            <Circle
                                key={`syn-${i}`}
                                center={[latS, lngS]}
                                radius={1000}
                                pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.15, weight: 2, dashArray: '6 4' }}
                            >
                                <Popup>
                                    <div style={{ minWidth: 200 }}>
                                        <p className="font-bold text-red-600 flex items-center text-sm mb-1">
                                            <ShieldAlert className="w-4 h-4 mr-1" /> Syndicate Ring Detected
                                        </p>
                                        <p className="text-gray-700 text-sm">
                                            {s.count} workers in this zone filed claims within 3 minutes.
                                        </p>
                                    </div>
                                </Popup>
                            </Circle>
                        );
                    })}

                    {/* Worker pins */}
                    {workers.map(w => {
                        if (!w.gps) return null;
                        return (
                            <Marker
                                key={w.worker_id}
                                position={[w.gps.lat, w.gps.lng]}
                                // STEP 3: pass risk_score for color selection
                                icon={createDivIcon(w.fraud_score, w.trigger, w.risk_score)}
                                ref={ref => { markerRefs.current[w.worker_id] = ref; }}
                            >
                                <Popup>
                                    <div style={{ minWidth: 220, fontFamily: 'sans-serif' }}>
                                        <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, borderBottom: '1px solid #e5e7eb', paddingBottom: 6 }}>
                                            {w.full_name}
                                        </p>
                                        <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.9 }}>
                                            <p><b>ID:</b> <span style={{ fontFamily: 'monospace' }}>{w.worker_id}</span></p>
                                            <p><b>Status:</b> Active</p>
                                            {/* STEP 5: Risk score tooltip */}
                                            {w.risk_score != null && (
                                                <p><b>Risk Score:</b> <span style={{ color: getRiskScoreColor(w.risk_score), fontWeight: 700 }}>{w.risk_score}/100 — {getRiskScoreLabel(w.risk_score)}</span></p>
                                            )}
                                            {w.trigger && <p style={{ color: '#ef4444', fontWeight: 'bold' }}><b>Condition:</b> ⚠️ Rain Detected ({w.condition})</p>}
                                            <p><b>Age:</b> {w.age}</p>
                                            <p><b>Phone:</b> {w.phone_number}</p>
                                            <p><b>City:</b> {w.city}</p>
                                        </div>
                                        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', margin: '8px 0' }}>
                                            <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                                                AI Risk Assessment
                                            </p>
                                            {w.ai ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ fontWeight: 700, color: '#374151' }}>Score:</span>
                                                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: w.ai.fraud_score <= 35 ? '#22c55e' : w.ai.fraud_score <= 70 ? '#f97316' : '#ef4444' }}>
                                                            {w.ai.fraud_score}/100
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ fontWeight: 700, color: '#374151' }}>Level:</span>
                                                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', background: '#e5e7eb', padding: '2px 6px', borderRadius: 4, color: '#374151' }}>
                                                            {w.ai.risk_level}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontWeight: 700, color: '#374151' }}>Status:</span>
                                                        <span style={{ color: w.ai.trigger ? '#ef4444' : '#22c55e', fontWeight: 700 }}>
                                                            {w.ai.trigger ? '⚠ Risk' : '✓ Safe'}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, paddingTop: 4, borderTop: '1px solid #e5e7eb' }}>
                                                        {w.ai.reason}
                                                    </div>
                                                </div>
                                            ) : (
                                                <p style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>Loading AI analysis...</p>
                                            )}
                                        </div>
                                        <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>
                                            🕐 {w.last_seen ? new Date(w.last_seen + 'Z').toLocaleString() : 'Location not updated'}
                                        </p>
                                        <button
                                            onClick={() => navigate('/transparency')}
                                            style={{ width: '100%', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, padding: '8px 0', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                                        >
                                            View Claims <ArrowRight size={14} />
                                        </button>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}
                </MapContainer>
            </div>

            {/* ── Right Sidebar Panel ── */}
            <div style={{ width: 300, borderLeft: '1px solid #1f2937', background: '#111827', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '20px', borderBottom: '1px solid #1f2937' }}>
                    <h2 className="text-base font-bold text-white flex items-center">
                        <Activity className="w-4 h-4 text-blue-500 mr-2" /> Fleet Tracker
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">{workers.filter(w => w.gps).length} active units</p>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {workers.map(w => {
                        const color = getRiskColor(w.fraud_score);
                        const label = getRiskLabel(w.fraud_score);
                        return (
                            <div
                                key={w.worker_id}
                                onClick={() => focusWorker(w)}
                                style={{ padding: '14px 18px', borderBottom: '1px solid #1f2937', cursor: w.gps ? 'pointer' : 'default', opacity: w.gps ? 1 : 0.5 }}
                                className="hover:bg-gray-800/80 transition-colors group"
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                    <span className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">
                                        {w.full_name}
                                    </span>
                                    {w.trigger ? (
                                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444', whiteSpace: 'nowrap', marginLeft: 8 }}>
                                            ⚠️ Rain Detected
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: `${color}22`, color, border: `1px solid ${color}44`, whiteSpace: 'nowrap', marginLeft: 8 }}>
                                            {label}
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                    <MapPin style={{ width: 11, height: 11, color: '#60a5fa', flexShrink: 0 }} />
                                    <span style={{ fontSize: 11, color: '#60a5fa', fontWeight: 500 }}>{w.city || '—'}</span>
                                </div>
                                <div style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>
                                    {w.last_seen ? new Date(w.last_seen + 'Z').toLocaleTimeString() : 'No GPS data'}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
