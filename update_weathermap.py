import os

file_path = r"f:\CopGuardAI\frontend\src\pages\WeatherMap.tsx"

code = """import { useEffect, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
    Cloud, Wind, Droplets, Thermometer,
    Activity, Eye, EyeOff, AlertTriangle, CheckCircle, RefreshCw
} from 'lucide-react';

// Fix Leaflet default icon paths broken by Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const mapStyles = `
@keyframes pulseDanger {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); transform: scale(1); }
  70% { box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); transform: scale(1.1); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); transform: scale(1); }
}
.dark-popup .leaflet-popup-content-wrapper {
  background: rgba(17, 24, 39, 0.95);
  color: #f9fafb;
  border: 1px solid #374151;
  border-radius: 10px;
  backdrop-filter: blur(8px);
}
.dark-popup .leaflet-popup-tip {
  background: rgba(17, 24, 39, 0.95);
  border: 1px solid #374151;
}

/* Localized Weather CSS Animations */
.local-weather-mask {
    border-radius: 50%;
    overflow: hidden;
    mask-image: radial-gradient(circle at center, black 0%, transparent 65%);
    -webkit-mask-image: radial-gradient(circle at center, black 0%, transparent 65%);
    width: 200px; height: 200px;
    pointer-events: none;
    display: flex; justify-content: center; align-items: center;
}

@keyframes fall {
    0% { background-position: 0 0, 20px -50px, 40px -100px; }
    100% { background-position: 0 200px, 20px 150px, 40px 100px; }
}
.geo-rain {
    width: 100%; height: 100%;
    background-color: rgba(0, 10, 30, 0.2);
    background-image: 
        linear-gradient(rgba(255,255,255,0.6) 10%, transparent 10%),
        linear-gradient(rgba(255,255,255,0.4) 10%, transparent 10%),
        linear-gradient(rgba(255,255,255,0.2) 10%, transparent 10%);
    background-size: 2px 70px, 1.5px 50px, 1px 30px;
    animation: fall 0.5s linear infinite;
}

@keyframes flash {
    0%, 100% { background-color: rgba(0, 5, 20, 0.3); }
    3%, 5% { background-color: rgba(255, 255, 255, 0.8); }
}
.geo-storm {
    width: 100%; height: 100%;
    background-image: 
        linear-gradient(rgba(255,255,255,0.6) 10%, transparent 10%),
        linear-gradient(rgba(255,255,255,0.4) 10%, transparent 10%);
    background-size: 3px 80px, 2px 60px;
    animation: fall 0.4s linear infinite, flash 4s infinite;
}

@keyframes geoCloudDrift {
    0% { background-position: 0% 0%; }
    100% { background-position: 300px 0%; }
}
.geo-clouds {
    width: 100%; height: 100%;
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="white" opacity="0.4" filter="blur(15px)"/></svg>');
    background-size: 200px 200px;
    animation: geoCloudDrift 30s linear infinite;
    mix-blend-mode: screen;
}

@keyframes sunGlow {
    0%, 100% { transform: scale(1); opacity: 0.1; }
    50% { transform: scale(1.1); opacity: 0.2; }
}
.geo-clear {
    width: 100%; height: 100%;
    background: radial-gradient(circle, rgba(253,224,71,0.3) 0%, transparent 60%);
    animation: sunGlow 5s ease-in-out infinite;
}
`;

const OWM_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY || '';
const HAS_OWM = OWM_KEY && OWM_KEY !== 'YOUR_OPENWEATHERMAP_API_KEY_HERE';

const LAYER_DEFS = [
    { id: 'precipitation', label: 'Precipitation', icon: Droplets, color: '#3b82f6', owm: 'precipitation_new' },
    { id: 'clouds', label: 'Clouds', icon: Cloud, color: '#8b5cf6', owm: 'clouds_new' },
    { id: 'wind', label: 'Wind', icon: Wind, color: '#10b981', owm: 'wind_new' },
    { id: 'temp', label: 'Temperature', icon: Thermometer, color: '#f59e0b', owm: 'temp_new' },
];

interface CityWeather {
    name: string; lat: number; lon: number;
    condition: string; description: string; icon: string;
    temp_c: number; wind_kph: number; humidity: number;
    is_storm: boolean; summary: string; wind_deg?: number;
}
interface WorkerLocation {
    worker_id: string; full_name: string; age: number; phone_number: string;
    gps: { lat: number; lng: number } | null;
    last_seen: string | null; fraud_score: number | null; verdict: string | null;
}
interface ClaimMarker {
    id: string; worker_id: string;
    gps_coords: { lat: number; lng: number };
    gap_finder?: { fraud_score: number; verdict: string };
}

const getWindDeg = (lat: number, lon: number) => Math.floor(Math.abs(Math.sin(lat * lon)) * 360);

const getWeatherIcon = (condition: string) => {
    const c = condition.toLowerCase();
    if (c.includes('thunderstorm') || c.includes('storm')) return '⛈️';
    if (c.includes('rain') || c.includes('drizzle')) return '🌧️';
    if (c.includes('snow')) return '❄️';
    if (c.includes('cloud')) return '☁️';
    if (c.includes('clear')) return '☀️';
    if (c.includes('wind')) return '💨';
    if (c.includes('heat') || c.includes('hot')) return '🔥';
    return '❓';
};

const getGeoWeatherZoneIcon = (condition: string) => {
    let typeClass = '';
    const c = condition.toLowerCase();
    if (c.includes('thunderstorm') || c.includes('storm')) typeClass = 'geo-storm';
    else if (c.includes('rain') || c.includes('drizzle')) typeClass = 'geo-rain';
    else if (c.includes('cloud')) typeClass = 'geo-clouds';
    else if (c.includes('clear')) typeClass = 'geo-clear';
    else return null;

    return L.divIcon({
        className: 'geo-weather-zone',
        html: `<div class="local-weather-mask"><div class="${typeClass}"></div></div>`,
        iconSize: [200, 200], iconAnchor: [100, 100] // Acts as ~30km radius depending on zoom
    });
};

const cityIcon = (emoji: string) => L.divIcon({
    className: 'custom-city-icon',
    html: `<div style="font-size: 26px; text-shadow: 0 2px 6px rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; width: 32px; height: 32px;">${emoji}</div>`,
    iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16],
});

const windArrowIcon = (deg: number) => L.divIcon({
    className: 'custom-wind-icon',
    html: `<div style="font-size: 18px; color: #10b981; transform: rotate(${deg}deg); display: flex; justify-content: center; align-items: center; width: 24px; height: 24px; text-shadow: 0 0 6px rgba(0,0,0,0.9); font-weight: bold;">↑</div>`,
    iconSize: [24, 24], iconAnchor: [12, 12]
});

const riskColor = (s: number | null) => {
    if (!s || s === 0) return '#22c55e'; // SAFE ZONE: Green
    if (s <= 35) return '#22c55e'; // SAFE ZONE: Green
    if (s <= 70) return '#eab308'; // MODERATE: Yellow
    return '#ef4444'; // DANGER: Red
};

const getHeatColor = (temp_c: number) => {
    if (temp_c < 20) return '#3b82f6';
    if (temp_c <= 30) return '#eab308';
    return '#ef4444';
};

const pulseDot = (color: string, isDanger: boolean, size = 18) => L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.6); ${isDanger ? 'animation: pulseDanger 1.5s infinite;' : ''}"></div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -(size / 2 + 4)],
});

function WeatherTiles({ layers }: { layers: Set<string> }) {
    const map = useMap();
    const refs = useRef<Record<string, L.TileLayer>>({});
    useEffect(() => {
        LAYER_DEFS.forEach(({ id, owm }) => {
            const url = `https://tile.openweathermap.org/map/${owm}/{z}/{x}/{y}.png?appid=${OWM_KEY}`;
            if (layers.has(id)) {
                if (!refs.current[id]) {
                    const layer = L.tileLayer(url, { opacity: 0.6 });
                    layer.on('tileerror', () => {
                        console.warn(`Weather layer ${owm} failed to load or requires active subscription/API access.`);
                    });
                    refs.current[id] = layer;
                    layer.addTo(map);
                }
            } else {
                if (refs.current[id]) {
                    map.removeLayer(refs.current[id]);
                    delete refs.current[id];
                }
            }
        });
    }, [layers, map]);
    return null;
}

export default function WeatherMap() {
    const [cities, setCities] = useState<CityWeather[]>([]);
    const [workers, setWorkers] = useState<WorkerLocation[]>([]);
    const [claims, setClaims] = useState<ClaimMarker[]>([]);
    const [showClaims, setShowClaims] = useState(false);
    const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set());
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchAll = useCallback(async () => {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        try {
            const [cR, wR, clR] = await Promise.all([
                fetch(`${import.meta.env.VITE_API_URL}/api/weather/cities`, { headers }),
                fetch(`${import.meta.env.VITE_API_URL}/api/workers/locations`, { headers }),
                fetch(`${import.meta.env.VITE_API_URL}/api/claims`, { headers }),
            ]);
            const cd = await cR.json();
            const wd = await wR.json();
            const cld = await clR.json();
            
            // Inject deterministic wind direction if not present & filter top 10 for performance
            const enhancedCities = (cd.cities || []).slice(0, 10).map((c: any) => ({
                ...c,
                wind_deg: c.wind_deg || getWindDeg(c.lat, c.lon)
            }));
            
            setCities(enhancedCities);
            setWorkers(wd.workers || []);
            setClaims(Array.isArray(cld) ? cld : []);
            setLastUpdated(new Date());
        } catch (e) {
            console.error('WeatherMap fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
        const t = setInterval(fetchAll, 300000); // Poll every 5 minutes
        return () => clearInterval(t);
    }, [fetchAll]);

    const toggleLayer = (id: string) => {
        setActiveLayers(prev => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    };

    const stormCities = cities.filter(c => c.is_storm);
    const minutesAgo = lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / 60000) : null;
    const mapCenter: [number, number] = [20.5937, 78.9629];

    if (loading) return (
        <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
            <Activity className="animate-spin mr-3 w-6 h-6" /> Loading Weather Intelligence Matrix...
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#030712', overflow: 'hidden' }}>
            <style>{mapStyles}</style>

            {/* ── Storm Alert Banner ── */}
            {stormCities.length > 0 ? (
                <div style={{ background: 'rgba(220,38,38,0.15)', borderBottom: '1px solid #ef4444', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <AlertTriangle style={{ color: '#ef4444', width: 20, height: 20 }} />
                    <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        ⚡ ACTIVE STORM ZONES DETECTED —&nbsp;
                    </span>
                    <span style={{ color: '#fca5a5', fontSize: 13 }}>
                        Cross-reference worker claims in: <strong>{stormCities.map(c => c.name).join(', ')}</strong>
                    </span>
                </div>
            ) : (
                <div style={{ background: 'rgba(34,197,94,0.08)', borderBottom: '1px solid #16a34a', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <CheckCircle style={{ color: '#22c55e', width: 16, height: 16 }} />
                    <span style={{ color: '#4ade80', fontSize: 13, fontWeight: 600 }}>All clear — No active localized storm zones detected</span>
                </div>
            )}

            {/* ── Main row ── */}
            <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

                {/* ── Map area ── */}
                <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>

                    {/* Layer toggles — top right */}
                    <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {LAYER_DEFS.map(({ id, label, icon: Icon, color }) => {
                            const on = activeLayers.has(id);
                            return (
                                <button key={id} onClick={() => toggleLayer(id)} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                                    borderRadius: 8, border: `1px solid ${on ? color : '#374151'}`,
                                    background: on ? `${color}22` : 'rgba(17,24,39,0.92)',
                                    color: on ? color : '#9ca3af',
                                    cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                    backdropFilter: 'blur(8px)', transition: 'all 0.2s',
                                    boxShadow: on ? `0 0 12px ${color}44` : 'none',
                                }}>
                                    <Icon style={{ width: 14, height: 14 }} /> {label}
                                </button>
                            );
                        })}

                        <div style={{ height: 1, background: '#374151', margin: '2px 0' }} />

                        <button onClick={() => setShowClaims(p => !p)} style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                            borderRadius: 8, border: `1px solid ${showClaims ? '#f59e0b' : '#374151'}`,
                            background: showClaims ? 'rgba(245,158,11,0.15)' : 'rgba(17,24,39,0.92)',
                            color: showClaims ? '#f59e0b' : '#9ca3af',
                            cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            backdropFilter: 'blur(8px)', transition: 'all 0.2s',
                        }}>
                            {showClaims ? <Eye style={{ width: 14, height: 14 }} /> : <EyeOff style={{ width: 14, height: 14 }} />}
                            Active Claims
                        </button>
                    </div>

                    {/* Header label — top left */}
                    <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 1000, background: 'rgba(17,24,39,0.92)', border: '1px solid #1f2937', borderRadius: 10, padding: '10px 16px', backdropFilter: 'blur(8px)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Cloud style={{ color: '#60a5fa', width: 16, height: 16 }} />
                            <span style={{ color: '#f9fafb', fontWeight: 700, fontSize: 14 }}>Weather Intel</span>
                            {!HAS_OWM && <span style={{ fontSize: 10, background: 'rgba(161,98,7,0.3)', color: '#fbbf24', border: '1px solid #92400e', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>MOCK DATA</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <RefreshCw style={{ color: '#6b7280', width: 11, height: 11 }} />
                            <span style={{ color: '#9ca3af', fontSize: 11 }}>
                                {minutesAgo === 0 ? 'Just updated' : minutesAgo !== null ? `Updated ${minutesAgo}m ago` : 'Loading...'}
                            </span>
                        </div>
                    </div>

                    {/* Claim legend — bottom left */}
                    {showClaims && (
                        <div style={{ position: 'absolute', bottom: 20, left: 12, zIndex: 1000, background: 'rgba(17,24,39,0.92)', border: '1px solid #1f2937', borderRadius: 10, padding: '12px 16px', backdropFilter: 'blur(8px)' }}>
                            <p style={{ color: '#6b7280', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Claim Verification</p>
                            {[['#22c55e', 'Storm confirmed — genuine signal'], ['#ef4444', 'No weather event — fraud signal']].map(([c, l]) => (
                                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                    <div style={{ width: 11, height: 11, borderRadius: '50%', background: c, border: '2px solid white' }} />
                                    <span style={{ color: '#d1d5db', fontSize: 11 }}>{l}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <MapContainer center={mapCenter} zoom={5} style={{ height: '100%', width: '100%' }} zoomControl>
                        {/* CartoDB Dark Matter basemap */}
                        <TileLayer
                            url="https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
                            subdomains={['a', 'b', 'c', 'd'] as any}
                        />

                        {/* OWM overlay layers (from toggle) */}
                        {HAS_OWM && <WeatherTiles layers={activeLayers} />}

                        {/* City Weather Icons & Local Geo-Zones (Tasks 1, 4, 5, 6) */}
                        {cities.map(c => {
                            const riskText = c.is_storm ? 'High (Storm)' : c.temp_c > 40 ? 'High (Heat)' : 'Low';
                            const riskCol = c.is_storm || c.temp_c > 40 ? '#ef4444' : '#22c55e';
                            
                            // Task 5 & 6: Geo-Zoned Local Animations
                            const geoIcon = getGeoWeatherZoneIcon(c.condition);
                            const cLower = c.condition.toLowerCase();
                            let isZoneActive = false;
                            
                            // Determine if local geo-zone should activate based on global toggles
                            if ((cLower.includes('rain') || cLower.includes('drizzle') || cLower.includes('storm')) && activeLayers.has('precipitation')) isZoneActive = true;
                            if (cLower.includes('cloud') && activeLayers.has('clouds')) isZoneActive = true;
                            if (cLower.includes('clear')) isZoneActive = true; // Clear glow always shows since no layer

                            return (
                                <div key={c.name}>
                                    {/* Weather Zone Animation Mask Layer */}
                                    {isZoneActive && geoIcon && (
                                        <Marker position={[c.lat, c.lon]} icon={geoIcon} interactive={false} zIndexOffset={-100} />
                                    )}

                                    {/* Task 5: Heat Overlay */}
                                    {activeLayers.has('temp') && (
                                        <Circle center={[c.lat, c.lon]} radius={40000} 
                                            pathOptions={{ color: getHeatColor(c.temp_c), fillColor: getHeatColor(c.temp_c), fillOpacity: 0.35, weight: 0 }} />
                                    )}
                                    
                                    {/* Task 1 & 8: Main City Emoji Icon (Synced with panel) */}
                                    <Marker position={[c.lat, c.lon]} icon={cityIcon(getWeatherIcon(c.condition))}>
                                        <Popup className="dark-popup">
                                            <div style={{ minWidth: 200, fontFamily: 'sans-serif' }}>
                                                <p style={{ fontWeight: 700, fontSize: 16, borderBottom: '1px solid #374151', paddingBottom: 6, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    {getWeatherIcon(c.condition)} {c.name}
                                                </p>
                                                <div style={{ fontSize: 13, color: '#d1d5db', marginBottom: 8 }}>
                                                    <p style={{ marginBottom: 4 }}><strong>Condition:</strong> {c.description}</p>
                                                    <p style={{ marginBottom: 4 }}><strong>Temperature:</strong> {c.temp_c}°C</p>
                                                    <p style={{ marginBottom: 4 }}><strong>Humidity:</strong> {c.humidity}%</p>
                                                    <p style={{ marginBottom: 4 }}><strong>Wind:</strong> {c.wind_kph} km/h</p>
                                                </div>
                                                <div style={{ background: 'rgba(17,24,39,0.5)', border: `1px solid ${riskCol}44`, borderRadius: 6, padding: '8px 10px' }}>
                                                    <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>Environmental Risk</p>
                                                    <span style={{ fontSize: 12, background: `${riskCol}22`, color: riskCol, padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                                                        {riskText}
                                                    </span>
                                                </div>
                                            </div>
                                        </Popup>
                                    </Marker>

                                    {/* Task 4: Wind Direction Icon */}
                                    {activeLayers.has('wind') && c.wind_deg !== undefined && (
                                        <Marker position={[c.lat, c.lon]} icon={windArrowIcon(c.wind_deg)} interactive={false} />
                                    )}
                                </div>
                            );
                        })}

                        {/* Worker pins (Task 7) */}
                        {workers.map(w => {
                            if (!w.gps) return null;
                            const isDanger = w.fraud_score ? w.fraud_score > 70 : false;
                            const color = riskColor(w.fraud_score);
                            return (
                                <Marker key={w.worker_id} position={[w.gps.lat, w.gps.lng]} icon={pulseDot(color, isDanger)}>
                                    <Popup className="dark-popup">
                                        <div style={{ minWidth: 200, fontFamily: 'sans-serif' }}>
                                            <p style={{ fontWeight: 700, fontSize: 14, borderBottom: '1px solid #374151', paddingBottom: 6, marginBottom: 8 }}>{w.full_name}</p>
                                            <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
                                                <span style={{ fontFamily: 'monospace' }}>{w.worker_id}</span> · Age {w.age}
                                            </p>
                                            <div style={{ background: 'rgba(17,24,39,0.5)', border: '1px solid #374151', borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
                                                <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>Fraud Status</p>
                                                {w.fraud_score ? (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color }}>Score: {w.fraud_score}/100</span>
                                                        <span style={{ fontSize: 11, background: `${color}22`, color: color, padding: '2px 6px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase' }}>
                                                            {w.verdict?.replace('_', ' ')}
                                                        </span>
                                                    </div>
                                                ) : <p style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic', fontWeight: 600, color: '#22c55e' }}>No active claims detected</p>}
                                            </div>
                                            {w.last_seen && <p style={{ fontSize: 10, color: '#6b7280' }}>🕐 {new Date(w.last_seen + 'Z').toLocaleString()}</p>}
                                        </div>
                                    </Popup>
                                </Marker>
                            );
                        })}

                        {/* Claims overlay */}
                        {showClaims && claims.map(c => {
                            const hasStorm = stormCities.some(city => Math.abs(city.lat - c.gps_coords.lat) < 2 && Math.abs(city.lon - c.gps_coords.lng) < 2);
                            const claimColor = hasStorm ? '#22c55e' : '#ef4444';
                            return (
                                <Circle key={c.id} center={[c.gps_coords.lat, c.gps_coords.lng]} radius={6000}
                                    pathOptions={{ color: claimColor, fillColor: claimColor, fillOpacity: 0.25, weight: 1.5 }}>
                                    <Popup className="dark-popup">
                                        <div style={{ minWidth: 180, fontFamily: 'sans-serif' }}>
                                            <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Claim {c.id}</p>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: claimColor }} />
                                                <span style={{ fontSize: 12, fontWeight: 600, color: claimColor }}>
                                                    {hasStorm ? '✓ Storm confirmed — likely genuine' : '⚠ No storm detected — investigate'}
                                                </span>
                                            </div>
                                            {c.gap_finder && <p style={{ fontSize: 12, color: '#9ca3af' }}>Score: {c.gap_finder.fraud_score}/100 · {c.gap_finder.verdict?.replace('_', ' ')}</p>}
                                        </div>
                                    </Popup>
                                </Circle>
                            );
                        })}
                    </MapContainer>
                </div>

                {/* ── City Weather Sidebar ── */}
                <div style={{ width: 300, borderLeft: '1px solid #1f2937', background: '#0d1117', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #1f2937' }}>
                        <h2 style={{ color: '#f9fafb', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Cloud style={{ color: '#60a5fa', width: 14, height: 14 }} /> City Weather Intel
                        </h2>
                        <p style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>Major Indian cities — live conditions</p>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {cities.map(city => {
                            const alert = city.is_storm;
                            const lBorder = alert ? '#ef4444' : city.condition === 'Clear' ? '#22c55e' : '#1f2937';
                            const bg = alert ? 'rgba(220,38,38,0.07)' : city.condition === 'Clear' ? 'rgba(34,197,94,0.04)' : 'transparent';
                            return (
                                <div key={city.name} style={{ padding: '14px 18px', borderBottom: '1px solid #1f2937', borderLeft: `3px solid ${lBorder}`, background: bg }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{ fontSize: 24, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{getWeatherIcon(city.condition)}</div>
                                            <div>
                                                <p style={{ fontWeight: 700, fontSize: 14, color: '#f9fafb' }}>{city.name}</p>
                                                <p style={{ fontSize: 11, color: alert ? '#fca5a5' : '#9ca3af', marginTop: 2 }}>{city.description}</p>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <p style={{ fontSize: 22, fontWeight: 700, color: '#f9fafb', lineHeight: 1 }}>{city.temp_c}°</p>
                                            {alert && <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>⚡ STORM</span>}
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <Wind style={{ width: 11, height: 11, color: '#60a5fa' }} />
                                            <span style={{ fontSize: 11, color: '#9ca3af' }}>{city.wind_kph} km/h</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <Droplets style={{ width: 11, height: 11, color: '#818cf8' }} />
                                            <span style={{ fontSize: 11, color: '#9ca3af' }}>{city.humidity}%</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ padding: '10px 18px', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#4b5563' }}>Auto-refresh every 5 min</span>
                        <button onClick={fetchAll} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer' }}>
                            <RefreshCw style={{ width: 12, height: 12 }} /> Refresh now
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
"""

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

print("WeatherMap.tsx dynamically updated to localized effects successfully.")
