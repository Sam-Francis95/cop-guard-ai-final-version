import { useEffect, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
    Radio, Activity, AlertTriangle,
    Signal, RefreshCw
} from 'lucide-react';

// Fix Leaflet icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

// ─── Types ──────────────────────────────────────────────────────────────────
interface Tower {
    id: string; lat: number; lon: number; lng?: number;
    city: string; state: string;
    operator: string;
    frequency?: string; mcc?: number; mnc?: number;
    operators?: string[];
    level?: string;
}

const MAIN_CITIES = [
    "Chennai","Bangalore","Mumbai","Delhi",
    "Hyderabad","Kolkata","Ahmedabad",
    "Jaipur","Lucknow","Bhopal","Patna",
    "Ranchi","Raipur","Bhubaneswar","Chandigarh"
];

interface WorkerLocation {
    worker_id: string; full_name: string; age: number; phone_number: string;
    gps: { lat: number; lng: number } | null;
    last_seen: string | null; fraud_score: number | null; verdict: string | null;
}
interface ClaimData {
    id: string; worker_id: string;
    gps_coords: { lat: number; lng: number };
    sensor_data?: { cell_towers_detected?: number };
    environment?: { cell_tower_handoffs?: number };
    gap_finder?: { fraud_score: number; verdict: string };
}
interface WorkerNetworkResult {
    worker: WorkerLocation;
    nearbyCount: number;
    dominantOp: string;
    coverage: 'strong' | 'medium' | 'weak';
    claimedHandoffs: number;
    networkFraudScore: number; // 0-100
    fraudWarning: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const OP_COLORS: Record<string, string> = {
    Jio: '#3b82f6', Airtel: '#ef4444', Vi: '#a855f7', BSNL: '#f97316', default: '#6b7280'
};

const cleanTowerIcon = (op: string) => {
    const color = OP_COLORS[op] || OP_COLORS.default;
    return L.divIcon({
        className: 'clean-tower-marker',
        html: `<div style="background-color:${color}; width:12px; height:12px; border-radius:50%; border:1px solid #fff; opacity:0.8;"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
        popupAnchor: [0, -6],
    });
};

const createClusterCustomIcon = function (cluster: any) {
    return L.divIcon({
        html: `<div style="background:#111; color:white; border-radius:50%; font-weight:bold; display:flex; align-items:center; justify-content:center; width:30px; height:30px; box-shadow: 0 0 5px rgba(255,255,255,0.3); border: 2px solid #333;"><span>${cluster.getChildCount()}</span></div>`,
        className: 'custom-marker-cluster',
        iconSize: L.point(30, 30, true),
    });
};

function generateMockTowers(): Tower[] {
    return [
        { id: "mock1", lat: 13.0827, lng: 80.2707, operator: "Jio", frequency: "Band 3", mcc: 404, mnc: 86, operators: ["Jio"] },
        { id: "mock2", lat: 12.9716, lng: 77.5946, operator: "Airtel", frequency: "Band 40", mcc: 404, mnc: 45, operators: ["Airtel"] },
        { id: "mock3", lat: 17.3850, lng: 78.4867, operator: "Vi", frequency: "Band 1", mcc: 404, mnc: 88, operators: ["Vi"] },
        { id: "mock4", lat: 28.6139, lng: 77.2090, operator: "BSNL", frequency: "Band 8", mcc: 404, mnc: 38, operators: ["BSNL"] }
    ];
}

const workerIcon = (coverage: 'strong' | 'medium' | 'weak') => {
    const color = coverage === 'strong' ? '#22c55e' : coverage === 'medium' ? '#f97316' : '#3b82f6';
    return L.divIcon({
        className: '',
        html: `<div style="
            width:20px; height:20px; border-radius:50%;
            background:${color}; border:3px solid white;
            box-shadow: 0 0 12px ${color}88;
        "></div>`,
        iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -14],
    });
};

function calcNetworkFraudScore(nearbyCount: number, claimedHandoffs: number): { score: number; warning: string | null } {
    if (nearbyCount === 0) return { score: 0, warning: null };
    // If claimed 0 handoffs but many towers nearby → suspicious
    if (claimedHandoffs === 0 && nearbyCount >= 5) {
        return {
            score: Math.min(100, 50 + nearbyCount * 5),
            warning: `Worker claims zero handoffs but ${nearbyCount} towers detected nearby.`
        };
    }
    if (claimedHandoffs === 0 && nearbyCount >= 2) {
        return {
            score: 30 + nearbyCount * 5,
            warning: `Worker claims zero handoffs but ${nearbyCount} towers nearby.`
        };
    }
    // Claimed handoffs reasonable vs tower density
    const ratio = claimedHandoffs / Math.max(nearbyCount, 1);
    if (ratio >= 0.3) return { score: 5, warning: null };
    return { score: 15, warning: null };
}

function getRandomOperators() {
    const ops = ["Jio", "Airtel", "Vi", "BSNL"];
    return ops.filter(() => Math.random() > 0.5);
}

function generateTowers(bounds: L.LatLngBounds, zoom: number): Tower[] {
    const towers: Tower[] = [];
    let step;
    if (zoom >= 14) step = 0.01;      // very dense (street)
    else if (zoom >= 11) step = 0.03; // city level
    else if (zoom >= 8) step = 0.08;  // regional
    else step = 0.2;                  // country level

    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const west = bounds.getWest();

    for (let lat = south; lat <= north; lat += step) {
        for (let lon = west; lon <= east; lon += step) {
            const operators = getRandomOperators();
            if (operators.length > 0) {
                towers.push({
                    id: `DYN_${lat.toFixed(4)}_${lon.toFixed(4)}`,
                    lat,
                    lng: lon,
                    operator: operators[0],
                    operators,
                    frequency: 'Multi',
                    mcc: 404,
                    mnc: 0
                });
            }
        }
    }
    return towers;
}

// ─── City coverage zones (for the overlay circles) ──────────────────────────
const CITY_ZONES = [
    { name: 'Mumbai', lat: 19.0760, lng: 72.8777, r: 18000, strong: true },
    { name: 'Delhi', lat: 28.6139, lng: 77.2090, r: 20000, strong: true },
    { name: 'Bangalore', lat: 12.9716, lng: 77.5946, r: 17000, strong: true },
    { name: 'Chennai', lat: 13.0827, lng: 80.2707, r: 16000, strong: true },
    { name: 'Hyderabad', lat: 17.3850, lng: 78.4867, r: 15000, strong: true },
    { name: 'Kolkata', lat: 22.5726, lng: 88.3639, r: 14000, strong: true },
    { name: 'Pune', lat: 18.5204, lng: 73.8567, r: 12000, strong: true },
    { name: 'Ahmedabad', lat: 23.0225, lng: 72.5714, r: 12000, strong: true },
    { name: 'Jaipur', lat: 26.9124, lng: 75.7873, r: 10000, strong: true },
    { name: 'Surat', lat: 21.1702, lng: 72.8311, r: 8000, strong: true },
    { name: 'Lucknow', lat: 26.8467, lng: 80.9462, r: 8000, strong: false },
    { name: 'Patna', lat: 25.5941, lng: 85.1376, r: 7000, strong: false },
    { name: 'Bhopal', lat: 23.2599, lng: 77.4126, r: 7000, strong: false },
    { name: 'Nagpur', lat: 21.1458, lng: 79.0882, r: 7000, strong: false },
    { name: 'Rural Zone A', lat: 22.0000, lng: 74.5000, r: 25000, strong: false },
    { name: 'Rural Zone B', lat: 15.5000, lng: 75.8000, r: 22000, strong: false },
    { name: 'Rural Zone C', lat: 24.0000, lng: 83.0000, r: 20000, strong: false },
];

let renderTimeout: NodeJS.Timeout;
function NetworkMapBounds({ setBounds, setZoom }: { setBounds: (b: L.LatLngBounds) => void, setZoom: (z: number) => void }) {
    const map = useMapEvents({
        moveend: () => {
            clearTimeout(renderTimeout);
            renderTimeout = setTimeout(() => {
                setBounds(map.getBounds());
                setZoom(map.getZoom());
            }, 150);
        },
        zoomend: () => {
            clearTimeout(renderTimeout);
            renderTimeout = setTimeout(() => {
                setBounds(map.getBounds());
                setZoom(map.getZoom());
            }, 150);
        },
    });
    useEffect(() => { 
        setBounds(map.getBounds()); 
        setZoom(map.getZoom());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map]);
    return null;
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function NetworkMap() {
    const [towers, setTowers] = useState<Tower[]>([]);
    const [workerResults, setWorkerResults] = useState<WorkerNetworkResult[]>([]);
    const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
    const [zoom, setZoom] = useState(5);
    const [showTowers, setShowTowers] = useState(true);
    const [showZones, setShowZones] = useState(true);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const fetchAll = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            console.warn("No token found → using fallback data");
            const fallbackTowers = generateMockTowers();
            setTowers(fallbackTowers);
            console.log("TOWERS DATA:", fallbackTowers);
            setWorkerResults([]);
            setLoading(false);
            return;
        }

        const headers = { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}` 
        };
        try {
            let td: any = { towers: [] };
            let wd: any = { workers: [] };
            let cd: any = [];

            try {
                const [tRes, wRes, cRes] = await Promise.all([
                    fetch(`${import.meta.env.VITE_API_URL}/api/network/towers`, { headers }),
                    fetch(`${import.meta.env.VITE_API_URL}/api/workers/locations`, { headers }),
                    fetch(`${import.meta.env.VITE_API_URL}/api/claims`, { headers }),
                ]);
                if (!tRes.ok) throw new Error("API failed");
                td = await tRes.json();
                if (wRes.ok) wd = await wRes.json();
                if (cRes.ok) cd = await cRes.json();
            } catch (fetchErr) {
                console.error("API failed → fallback mode", fetchErr);
                td = { towers: generateMockTowers() };
            }

            let allTowers: Tower[] = td.towers || [];
            
            if (allTowers.length > 0) {
                allTowers.forEach((t: any) => {
                    t.operators = t.operators || [t.operator || 'Jio'];
                    if (t.lon === undefined && t.lng !== undefined) t.lon = t.lng;
                    if (t.lng === undefined && t.lon !== undefined) t.lng = t.lon;
                    
                    if (!t.city) {
                        for (const z of CITY_ZONES) {
                            if (Math.abs(t.lat - z.lat) < 0.2 && Math.abs(t.lon - z.lng) < 0.2) {
                                t.city = z.name;
                                t.state = z.name;
                                break;
                            }
                        }
                    }
                });
            }
            
            console.log("TOWERS DATA:", allTowers);
            const allWorkers: WorkerLocation[] = wd.workers || [];
            const allClaims: ClaimData[] = Array.isArray(cd) ? cd : [];

            setTowers(allTowers);

            // Compute per-worker network fraud results
            const results: WorkerNetworkResult[] = allWorkers.map(w => {
                if (!w.gps) return {
                    worker: w, nearbyCount: 0, dominantOp: 'N/A',
                    coverage: 'weak', claimedHandoffs: 0, networkFraudScore: 0, fraudWarning: null
                };

                // Count towers within 10km of worker
                const nearbyTowers = allTowers.filter(t => {
                    const dlat = (t.lat - w.gps!.lat) * 111000;
                    const dlng = (t.lon - w.gps!.lng) * 111000 * Math.cos(w.gps!.lat * Math.PI / 180);
                    return Math.sqrt(dlat * dlat + dlng * dlng) <= 10000;
                });

                const opCount: Record<string, number> = {};
                nearbyTowers.forEach(t => {
                    (t.operators || [t.operator]).forEach(op => opCount[op] = (opCount[op] || 0) + 1);
                });
                const dominantOp = Object.keys(opCount).sort((a, b) => opCount[b] - opCount[a])[0] || 'None';
                const coverage = nearbyTowers.length >= 15 ? 'strong' : nearbyTowers.length >= 5 ? 'medium' : 'weak';

                // Find claimed handoffs from latest claim
                const wClaim = allClaims.find(c => c.worker_id === w.worker_id);
                const claimedHandoffs = wClaim?.environment?.cell_tower_handoffs
                    ?? wClaim?.sensor_data?.cell_towers_detected ?? 0;

                const { score, warning } = calcNetworkFraudScore(nearbyTowers.length, claimedHandoffs);
                return {
                    worker: w, nearbyCount: nearbyTowers.length, dominantOp,
                    coverage, claimedHandoffs, networkFraudScore: score, fraudWarning: warning
                };
            });

            results.sort((a, b) => b.networkFraudScore - a.networkFraudScore);
            setWorkerResults(results);
            setLastUpdated(new Date());
        } catch (e) {
            console.error('NetworkMap fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
        const t = setInterval(fetchAll, 300000);
        return () => clearInterval(t);
    }, [fetchAll]);

    const mapCenter: [number, number] = [20.5937, 78.9629];

    const memoizedTowers = useMemo(() => {
        if (!towers || towers.length === 0 || !showTowers) return [];
        
        let validTowers = towers.filter(
            t => t.lat !== undefined && t.lon !== undefined && !isNaN(t.lat) && !isNaN(t.lon)
        );
        
        // Dynamic procedural generation fallback
        if (bounds) {
            const visible = validTowers.filter(t => bounds.contains([t.lat, t.lon]));
            if (visible.length === 0) {
                console.warn("No towers available in this region. Generating fallback procedural towers for visualization.");
                const generated = generateTowers(bounds, zoom).map(t => ({ ...t, lon: t.lng, city: 'Unknown', state: 'Unknown' }));
                validTowers = [...validTowers, ...(generated as Tower[])];
            }
        }
        
        console.log("MAP COMPONENT RENDERED");
        console.log("VALID TOWERS:", validTowers.length);
        
        let filtered = [];

        // ZOOM LEVEL 1 → MAIN CITIES ONLY
        if (zoom <= 6) {
            filtered = validTowers.filter(t => t.city && MAIN_CITIES.includes(t.city));
        }
        // ZOOM LEVEL 2 → CITY LEVEL
        else if (zoom > 6 && zoom <= 10) {
            filtered = validTowers.filter(t => bounds && bounds.contains([t.lat, t.lon])).slice(0, 200);
        }
        // ZOOM LEVEL 3 → LOCAL (ONLY WITHIN VIEWPORT)
        else if (zoom > 10 && bounds) {
            filtered = validTowers.filter(t => bounds.contains([t.lat, t.lon]));
        }

        const MAX_MARKERS = 500;
        return filtered.slice(0, MAX_MARKERS);
    }, [towers, bounds, showTowers, zoom]);

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#030712', color: '#9ca3af' }}>
            <Activity style={{ width: 24, height: 24, marginRight: 12, animation: 'spin 1s linear infinite' }} />
            Loading Network Intelligence Matrix...
        </div>
    );

    return (
        <div className="desktop-layout" style={{ display: 'flex', height: '100vh', background: '#030712', overflow: 'hidden' }}>
            {/* ── Map Area ── */}
            <div className="map-wrapper" style={{ height: '100vh', width: '100%', position: 'relative', flex: 1, minWidth: 0 }}>

                {/* Header badge */}
                <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 1000, background: 'rgba(17,24,39,0.92)', border: '1px solid #1f2937', borderRadius: 10, padding: '10px 16px', backdropFilter: 'blur(8px)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Radio style={{ color: '#60a5fa', width: 16, height: 16 }} />
                        <span style={{ color: '#f9fafb', fontWeight: 700, fontSize: 14 }}>Network Intelligence</span>
                    </div>
                    <p style={{ color: '#6b7280', fontSize: 11, marginTop: 3 }}>
                        Cell Tower Coverage Map — India
                    </p>
                    <p style={{ color: '#4b5563', fontSize: 10, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <RefreshCw style={{ width: 10, height: 10 }} />
                        {lastUpdated ? `Updated ${Math.floor((Date.now() - lastUpdated.getTime()) / 60000)}m ago` : 'Loading...'}
                    </p>
                </div>

                {/* Controls — top right */}
                <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                        { label: 'Tower Pins', state: showTowers, toggle: () => setShowTowers(p => !p), color: '#3b82f6' },
                        { label: 'Coverage Zones', state: showZones, toggle: () => setShowZones(p => !p), color: '#22c55e' },
                    ].map(({ label, state, toggle, color }) => (
                        <button key={label} onClick={toggle} style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                            borderRadius: 8, border: `1px solid ${state ? color : '#374151'}`,
                            background: state ? `${color}22` : 'rgba(17,24,39,0.92)',
                            color: state ? color : '#9ca3af', cursor: 'pointer',
                            fontSize: 12, fontWeight: 600, backdropFilter: 'blur(8px)',
                            boxShadow: state ? `0 0 12px ${color}44` : 'none',
                        }}>
                            <Signal style={{ width: 14, height: 14 }} /> {label}
                        </button>
                    ))}
                </div>

                {/* Operator legend — bottom left */}
                <div style={{ position: 'absolute', bottom: 20, left: 12, zIndex: 1000, background: 'rgba(17,24,39,0.92)', border: '1px solid #1f2937', borderRadius: 10, padding: '12px 16px', backdropFilter: 'blur(8px)' }}>
                    <p style={{ color: '#6b7280', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Network Operators</p>
                    {Object.entries(OP_COLORS).filter(([k]) => k !== 'default').map(([op, color]) => (
                        <div key={op} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                            <span style={{ fontSize: 11, color: '#d1d5db' }}>{op}</span>
                        </div>
                    ))}
                    <div style={{ borderTop: '1px solid #1f2937', marginTop: 8, paddingTop: 8 }}>
                        <p style={{ color: '#6b7280', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Worker Coverage</p>
                        {[['#22c55e', 'Strong (≥15 towers)'], ['#f97316', 'Medium (5-14)'], ['#3b82f6', 'Weak (<5)']].map(([c, l]) => (
                            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <div style={{ width: 12, height: 12, borderRadius: '50%', background: c, border: '2px solid white' }} />
                                <span style={{ fontSize: 11, color: '#d1d5db' }}>{l}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <MapContainer className="map-container" center={mapCenter} zoom={5} scrollWheelZoom={true} style={{ height: '100%', width: '100%', backgroundColor: '#030712' }} zoomControl>
                    <NetworkMapBounds setBounds={setBounds} setZoom={setZoom} />
                    <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                        subdomains={['a', 'b', 'c', 'd']}
                    />

                    {/* Coverage zone circles */}
                    {showZones && CITY_ZONES.map((z, index) => (
                        <Circle key={`zone-${z.lat}-${z.lng}-${index}`} center={[z.lat, z.lng]} radius={z.r}
                            pathOptions={{
                                color: z.strong ? '#3b82f6' : '#ef444488',
                                fillColor: z.strong ? '#3b82f6' : '#ef4444',
                                fillOpacity: z.strong ? 0.06 : 0.04,
                                weight: z.strong ? 1.5 : 1,
                                dashArray: z.strong ? undefined : '6 4',
                            }}>
                            <Popup>
                                <div style={{ fontFamily: 'sans-serif', minWidth: 160 }}>
                                    <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{z.name}</p>
                                    <p style={{ fontSize: 12, color: z.strong ? '#2563eb' : '#dc2626', fontWeight: 600 }}>
                                        {z.strong ? '📶 Strong Coverage Zone' : '⚠️ Weak/Rural Zone'}
                                    </p>
                                    <p style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                                        Radius: {(z.r / 1000).toFixed(0)} km from city centre
                                    </p>
                                </div>
                            </Popup>
                        </Circle>
                    ))}

                    {/* Dense clustered towers resolving overlap noise natively */}
                    <MarkerClusterGroup
                        iconCreateFunction={createClusterCustomIcon}
                        showCoverageOnHover={false}
                        disableClusteringAtZoom={13}
                        maxClusterRadius={50}
                        chunkedLoading={true}
                    >
                        {memoizedTowers.map((t, index) => {
                            return (t.operators || [t.operator]).map((op, opIdx) => {
                                return (
                                    <Marker key={`mark-${t.id || (t.lat + "-" + t.lon + "-" + index)}-${opIdx}`} position={[t.lat, t.lon]} icon={cleanTowerIcon(op)}>
                                        <Popup>
                                            <div style={{ fontFamily: 'sans-serif', minWidth: 180 }}>
                                                <p style={{ fontWeight: 700, fontSize: 13, borderBottom: '1px solid #e5e7eb', paddingBottom: 5, marginBottom: 6 }}>
                                                    📡 Cell Tower
                                                </p>
                                                <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.8 }}>
                                                    <p><b>ID:</b> <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{t.id}</span></p>
                                                    <p><b>Operators:</b> {(t.operators || [t.operator]).join(', ')}</p>
                                                    <p><b>Current Band:</b> <span style={{ color: OP_COLORS[op] || '#000', fontWeight: 700 }}>{op}</span></p>
                                                    <p><b>Frequency:</b> {t.frequency || 'Multi'}</p>
                                                    <p><b>GPS:</b> {t.lat.toFixed(5)}, {t.lon.toFixed(5)}</p>
                                                </div>
                                            </div>
                                        </Popup>
                                    </Marker>
                                );
                            });
                        })}
                    </MarkerClusterGroup>

                    {/* Worker pins with coverage context */}
                    {workerResults.map(r => {
                        if (!r.worker.gps) return null;
                        return (
                            <Marker
                                key={r.worker.worker_id}
                                position={[r.worker.gps.lat, r.worker.gps.lng]}
                                icon={workerIcon(r.coverage)}
                            >
                                <Popup>
                                    <div style={{ fontFamily: 'sans-serif', minWidth: 230 }}>
                                        <p style={{ fontWeight: 700, fontSize: 15, borderBottom: '1px solid #e5e7eb', paddingBottom: 6, marginBottom: 8 }}>
                                            {r.worker.full_name}
                                        </p>
                                        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                                            {r.worker.worker_id} · Age {r.worker.age}
                                        </p>

                                        {/* Network stats */}
                                        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
                                            <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 6 }}>Network Analysis</p>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 12 }}>
                                                <p style={{ color: '#374151' }}><b>Towers nearby:</b></p>
                                                <p style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8' }}>{r.nearbyCount}</p>
                                                <p style={{ color: '#374151' }}><b>Dominant op:</b></p>
                                                <p style={{ color: OP_COLORS[r.dominantOp] || '#000', fontWeight: 700 }}>{r.dominantOp}</p>
                                                <p style={{ color: '#374151' }}><b>Coverage:</b></p>
                                                <p style={{ fontWeight: 700, color: r.coverage === 'strong' ? '#16a34a' : r.coverage === 'medium' ? '#ea580c' : '#2563eb' }}>
                                                    {r.coverage.charAt(0).toUpperCase() + r.coverage.slice(1)}
                                                </p>
                                                <p style={{ color: '#374151' }}><b>Claimed handoffs:</b></p>
                                                <p style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.claimedHandoffs}</p>
                                            </div>
                                        </div>

                                        {/* Fraud warning */}
                                        {r.fraudWarning && (
                                            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 10px', display: 'flex', gap: 8, marginBottom: 8 }}>
                                                <AlertTriangle style={{ width: 14, height: 14, color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
                                                <p style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>{r.fraudWarning}</p>
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <p style={{ fontSize: 11, color: '#9ca3af' }}>Network Fraud Score</p>
                                            <span style={{
                                                fontFamily: 'monospace', fontWeight: 700, fontSize: 14,
                                                color: r.networkFraudScore >= 50 ? '#ef4444' : r.networkFraudScore >= 25 ? '#f97316' : '#22c55e'
                                            }}>{r.networkFraudScore}/100</span>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}
                </MapContainer>
            </div>

            {/* ── Network Fraud Score Sidebar ── */}
            <div className="sidebar-wrapper" style={{ width: 300, flexShrink: 0, borderLeft: '1px solid #1f2937', background: '#0d1117', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #1f2937' }}>
                    <h2 style={{ color: '#f9fafb', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Signal style={{ color: '#60a5fa', width: 14, height: 14 }} /> Network Fraud Signal
                    </h2>
                    <p style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>
                        Workers ranked by handoff vs tower mismatch
                    </p>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {workerResults.map((r, idx) => {
                        const score = r.networkFraudScore;
                        const scoreColor = score >= 50 ? '#ef4444' : score >= 25 ? '#f97316' : '#22c55e';
                        const barWidth = `${score}%`;
                        const coverageColor = r.coverage === 'strong' ? '#22c55e' : r.coverage === 'medium' ? '#f97316' : '#3b82f6';

                        return (
                            <div key={r.worker.worker_id} style={{ padding: '14px 18px', borderBottom: '1px solid #1f2937', background: score >= 50 ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: 10, color: '#4b5563', fontFamily: 'monospace' }}>#{idx + 1}</span>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: '#f9fafb' }}>{r.worker.full_name}</span>
                                        </div>
                                        <span style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>{r.worker.worker_id}</span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{ fontSize: 18, fontWeight: 700, color: scoreColor, fontFamily: 'monospace' }}>{score}</span>
                                        <span style={{ fontSize: 10, color: '#6b7280' }}>/100</span>
                                    </div>
                                </div>

                                {/* Score bar */}
                                <div style={{ height: 4, background: '#1f2937', borderRadius: 2, marginBottom: 8, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: barWidth, background: scoreColor, borderRadius: 2, transition: 'width 0.5s ease' }} />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 8px', fontSize: 11 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: coverageColor }} />
                                        <span style={{ color: '#9ca3af' }}>{r.nearbyCount} towers nearby</span>
                                    </div>
                                    <span style={{ color: '#9ca3af', textAlign: 'right' }}>
                                        {r.claimedHandoffs} claimed
                                    </span>
                                </div>

                                {r.fraudWarning && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                                        <AlertTriangle style={{ width: 11, height: 11, color: '#ef4444', flexShrink: 0 }} />
                                        <span style={{ fontSize: 10, color: '#fca5a5' }}>Handoff anomaly detected</span>
                                    </div>
                                )}

                                {score === 0 && !r.worker.gps && (
                                    <span style={{ fontSize: 10, color: '#4b5563' }}>No GPS data</span>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div style={{ padding: '10px 18px', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#4b5563' }}>{towers.length} towers loaded</span>
                    <button onClick={fetchAll} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer' }}>
                        <RefreshCw style={{ width: 12, height: 12 }} /> Refresh
                    </button>
                </div>
            </div>

            <style>{`
                @import url("https://unpkg.com/leaflet@1.7.1/dist/leaflet.css");
                @import url("https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.css");
                @import url("https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.Default.css");

                @media (max-width: 768px) {
                    .desktop-layout { flex-direction: column !important; overflow-y: auto !important; }
                    .map-wrapper { height: 60vh !important; flex: none !important; width: 100% !important; min-height: 400px; }
                    .sidebar-wrapper { width: 100% !important; flex: none !important; border-left: none !important; border-top: 1px solid #1f2937; min-height: 400px; }
                }

                .map-container { overflow: hidden; position: relative; }
                .marker { transition: opacity 0.3s ease; }

                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                
                .tower-wrapper { position: relative; width: 20px; height: 20px; }
                .tower-core { width: 10px; height: 10px; border-radius: 50%; position: absolute; top: 5px; left: 5px; z-index: 10; box-shadow: 0 0 8px currentColor; }
                .wave { position: absolute; border-radius: 50%; border: 2px solid; width: 20px; height: 20px; top: 0; left: 0; opacity: 0; animation: waveAnim 2s infinite linear; pointer-events: none; }
                
                @keyframes waveAnim {
                    0% { transform: scale(0.5); opacity: 0.8; }
                    100% { transform: scale(1.5); opacity: 0; }
                }

                .leaflet-popup-content-wrapper { background: rgba(17,24,39,0.95); color: #f9fafb; border: 1px solid #374151; border-radius: 8px; backdrop-filter: blur(8px); }
                .leaflet-popup-tip { background: rgba(17,24,39,0.95); border: 1px solid #374151; }
            `}</style>
        </div>
    );
}
