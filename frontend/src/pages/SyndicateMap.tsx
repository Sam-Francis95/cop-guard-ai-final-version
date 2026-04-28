import React, { useEffect, useState, useMemo, Component, ReactNode, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Polyline, Circle, useMapEvents, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Network, Activity, ShieldAlert, Layers, Filter, Clock,
  Crosshair, ActivitySquare, CheckCircle, Search, ChevronRight, X, AlertTriangle, RefreshCw
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import type { Claim } from './Dashboard';

// --- MOCK SIMULATION ENGINE ---
const generateMockId = () => Math.random().toString(36).substring(2, 9);
const randomCoord = (base: number, variance: number) => base + (Math.random() - 0.5) * variance;

const generateMockClaims = (count: number, centerLat: number, centerLng: number): Claim[] => {
    return Array.from({ length: count }).map((_, i) => ({
        id: generateMockId(),
        worker_id: `W-${generateMockId()}`,
        worker_name: `Target-${Math.floor(Math.random() * 9999)}`,
        timestamp: new Date(Date.now() - Math.random() * 100000).toISOString(),
        gps_coords: { lat: randomCoord(centerLat, 0.1), lng: randomCoord(centerLng, 0.1) },
        signals: {},
        environment: {},
        gap_finder: {
            fraud_score: Math.floor(Math.random() * 100),
            verdict: 'soft_verify',
            confidence: 'medium',
            worker_report: '', q1_gaps: '', q2_blindspot: '', q3_false_positive: '', q4_reasoning_audit: '', score_adjustments: 0
        }
    }));
};

const DYNAMIC_CITIES = [
    { name: 'DEL-ZN-1', lat: 28.6139, lng: 77.2090 },
    { name: 'MUM-ZN-4', lat: 19.0760, lng: 72.8777 },
    { name: 'BLR-ZN-2', lat: 12.9716, lng: 77.5946 },
    { name: 'CHE-ZN-9', lat: 13.0827, lng: 80.2707 },
    { name: 'KOL-ZN-5', lat: 22.5726, lng: 88.3639 }
];

const mockSyndicateFetch = async (): Promise<[string, Claim[]][]> => {
    return new Promise(resolve => {
        setTimeout(() => {
            const activeClusters = DYNAMIC_CITIES.sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 3) + 2);
            const payload: [string, Claim[]][] = activeClusters.map(city => [
                city.name,
                generateMockClaims(Math.floor(Math.random() * 8) + 3, city.lat, city.lng)
            ]);
            resolve(payload);
        }, 500);
    });
};

// Error Boundary to gracefully catch rendering crashes
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return <div className="p-8 text-red-500 bg-gray-950 min-h-screen"><AlertTriangle className="inline mr-2" /> Unrecoverable Rendering Error. Please reload.</div>;
    return this.props.children;
  }
}

function MapController({ setZoom, setBounds, centerPos }: { setZoom: (z: number) => void, setBounds: (b: L.LatLngBounds) => void, centerPos: [number, number] }) {
  const map = useMapEvents({
    moveend: () => setBounds(map.getBounds()),
    zoomend: () => {
      setZoom(map.getZoom());
      setBounds(map.getBounds());
    }
  });

  useEffect(() => {
    map.setView(centerPos, map.getZoom());
  }, [centerPos, map]);

  useEffect(() => {
    setBounds(map.getBounds());
    setZoom(map.getZoom());
  }, [map, setBounds, setZoom]);
  return null;
}

export default function SyndicateMapWrapper() {
    return (
        <ErrorBoundary>
            <SyndicateMap />
        </ErrorBoundary>
    );
}

function SyndicateMap() {
  const [syndicateClusters, setSyndicateClusters] = useState<[string, Claim[]][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState(new Date().toLocaleTimeString());
  const navigate = useNavigate();

  const [trafficData, setTrafficData] = useState<{val: number}[]>([{val: 0}]);
  const [interceptsData, setInterceptsData] = useState<{val: number}[]>([{val: 0}]);
  const [alertsFeed, setAlertsFeed] = useState<{title: string, desc: string, time: string, color: string}[]>([]);

  const [mapZoom, setMapZoom] = useState(5);
  const [mapBounds, setMapBounds] = useState<L.LatLngBounds | null>(null);
  const [centerPos, setCenterPos] = useState<[number, number]>([20.5937, 78.9629]);
  
  const [showNodes, setShowNodes] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [showRings, setShowRings] = useState(true);
  const [timeRange, setTimeRange] = useState('24H');
  const [selectedCluster, setSelectedCluster] = useState<any>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
      if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
              (pos) => setCenterPos([pos.coords.latitude, pos.coords.longitude]),
              (err) => console.warn("Geolocation fallback triggering immediately. Details: ", err),
              { timeout: 3000 }
          );
      }
  }, []);

  useEffect(() => {
      let isMounted = true;
      const executePoll = async () => {
          try {
              const data = await mockSyndicateFetch();
              if (isMounted) {
                  setSyndicateClusters(data);
                  setLastSync(new Date().toLocaleTimeString());
                  setTrafficData(prev => [...prev, { val: Math.floor(Math.random() * 80) + 20 }].slice(-15));
                  setInterceptsData(prev => [...prev, { val: Math.floor(Math.random() * 50) + 10 }].slice(-15));
                  if (data.length > 3 && Math.random() > 0.4) {
                      setAlertsFeed(prev => [
                          { title: "Anomaly Peak Detected", desc: "Density spikes via autonomous grid.", time: new Date().toLocaleTimeString(), color: "text-red-500" },
                          ...prev
                      ].slice(0, 5));
                  }
                  setError(null);
                  setLoading(false);
              }
          } catch (err) {
              console.error(err);
              if (isMounted) setError("Network Intelligence Gateway interrupted.");
          }
      };

      executePoll();
      const intervalId = setInterval(executePoll, 4000);
      return () => {
          isMounted = false;
          clearInterval(intervalId);
      };
  }, []);

  const { nodes, edges, clusters } = useMemo(() => {
    let allNodes: any[] = [];
    let allEdges: any[] = [];
    let processedClusters: any[] = [];

    syndicateClusters.forEach(([loc, claims], clusterIdx) => {
      const clusterId = `cluster-${clusterIdx}`;
      let maxRisk = 0;
      let cLat = 0, cLng = 0;

      claims.forEach((c, idx) => {
        const risk = c.gap_finder?.fraud_score || 0;
        if (risk > maxRisk) maxRisk = risk;
        cLat += c.gps_coords.lat;
        cLng += c.gps_coords.lng;

        allNodes.push({
          ...c,
          clusterId,
          riskScore: risk,
          mockRole: idx === 0 ? 'Ring Leader' : (idx === 1 ? 'Facilitator' : 'Operator'),
          mockName: c.worker_name || `Entity-${c.id.substring(0, 5).toUpperCase()}`
        });

        if (idx > 0) {
          const prev = claims[idx - 1];
          allEdges.push({
            id: `edge-${prev.id}-${c.id}`,
            from: [prev.gps_coords.lat, prev.gps_coords.lng] as [number, number],
            to: [c.gps_coords.lat, c.gps_coords.lng] as [number, number],
            risk: Math.max(risk, prev.gap_finder?.fraud_score || 0)
          });
        }
        if (idx === claims.length - 1 && claims.length > 2) {
          allEdges.push({
            id: `edge-loop-${c.id}`,
            from: [c.gps_coords.lat, c.gps_coords.lng] as [number, number],
            to: [claims[0].gps_coords.lat, claims[0].gps_coords.lng] as [number, number],
            risk: Math.max(risk, claims[0].gap_finder?.fraud_score || 0)
          });
        }
      });

      if (claims.length > 0) {
        cLat /= claims.length;
        cLng /= claims.length;

        let maxDist = 0;
        claims.forEach(c => {
          const dlat = (c.gps_coords.lat - cLat) * 111000;
          const dlng = (c.gps_coords.lng - cLng) * 111000 * Math.cos(cLat * Math.PI / 180);
          const dist = Math.sqrt(dlat * dlat + dlng * dlng);
          if (dist > maxDist) maxDist = dist;
        });

        processedClusters.push({
          id: clusterId,
          center: [cLat, cLng] as [number, number],
          radius: Math.max(maxDist + 2000, 5000),
          count: claims.length,
          risk: maxRisk,
          timestamp: claims[0].timestamp,
          locStr: loc,
          members: allNodes.filter(n => n.clusterId === clusterId)
        });
      }
    });

    return { nodes: allNodes, edges: allEdges, clusters: processedClusters };
  }, [syndicateClusters]);

  const visibleNodes = useMemo(() => {
    if (!mapBounds) return [];
    return nodes.filter(n => mapBounds.contains([n.gps_coords.lat, n.gps_coords.lng])).slice(0, 300);
  }, [nodes, mapBounds]);

  const visibleEdges = useMemo(() => {
    if (!mapBounds || mapZoom < 6) return [];
    return edges.filter(e => mapBounds.contains(e.from) || mapBounds.contains(e.to)).slice(0, 200);
  }, [edges, mapBounds, mapZoom]);

  const visibleClusters = useMemo(() => {
    if (!mapBounds) return [];
    return clusters.filter(c => mapBounds.contains(c.center));
  }, [clusters, mapBounds]);

  const getRiskColor = (score: number) => score >= 70 ? '#ef4444' : score >= 40 ? '#eab308' : '#22c55e';
  const getRiskColorHex = (score: number) => score >= 70 ? '#ef4444' : score >= 40 ? '#eab308' : '#22c55e';

  if (loading) return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-gray-400">
          <Activity className="animate-spin w-10 h-10 mb-4 text-blue-500" /> 
          <p className="font-mono text-xs uppercase tracking-widest animate-pulse">Initializing Live Simulation Gateway...</p>
      </div>
  );

  return (
    <div className="relative h-screen w-full bg-gray-950 overflow-hidden font-sans text-gray-100 flex flex-col">
      {error && (
        <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-50 bg-red-900 border border-red-500 text-red-200 px-6 py-3 rounded-lg flex items-center shadow-2xl">
            <AlertTriangle className="mr-2" /> {error} - Rendering localized cache.
        </div>
      )}

      <div className="absolute inset-0 z-0">
        <MapContainer center={centerPos} zoom={5} style={{ height: '100%', width: '100%', background: '#0a0a0a' }} zoomControl={false}>
          <MapController setZoom={setMapZoom} setBounds={setMapBounds} centerPos={centerPos} />
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains={['a', 'b', 'c', 'd']}
          />

          {showLinks && mapZoom >= 6 && visibleEdges.map(edge => (
            <Polyline
              key={edge.id}
              positions={[edge.from, edge.to]}
              color={getRiskColor(edge.risk)}
              weight={edge.risk >= 70 ? 2 : 1}
              opacity={0.3}
              dashArray={edge.risk >= 70 ? undefined : "4 4"}
            />
          ))}

          {showRings && visibleClusters.map((cluster, i) => (
            <Circle
              key={cluster.id}
              center={cluster.center}
              radius={cluster.radius}
              pathOptions={{
                color: getRiskColor(cluster.risk),
                fillColor: getRiskColor(cluster.risk),
                fillOpacity: 0.05,
                weight: cluster.risk >= 70 ? 2 : 1,
                dashArray: "10 10",
                className: 'animate-spin-slow'
              }}
              eventHandlers={{
                click: () => setSelectedCluster(cluster)
              }}
            >
              <Tooltip sticky direction="top" className="bg-gray-900 text-white border border-gray-700">
                <p className="font-bold">Syndicate {cluster.id}</p>
                <p>Members: {cluster.count}</p>
              </Tooltip>
            </Circle>
          ))}

          {showNodes && visibleNodes.map((node) => (
            <CircleMarker
              key={node.id}
              center={[node.gps_coords.lat, node.gps_coords.lng]}
              radius={node.riskScore >= 70 ? 8 : 5}
              fillColor={getRiskColor(node.riskScore)}
              color="#fff"
              weight={1}
              fillOpacity={0.8}
              eventHandlers={{
                mouseover: () => setHoveredNode(node.id),
                mouseout: () => setHoveredNode(null),
                click: () => {
                  const parentCluster = clusters.find(c => c.id === node.clusterId);
                  if (parentCluster) setSelectedCluster(parentCluster);
                }
              }}
            >
              <Tooltip direction="right" offset={[10, 0]} className="bg-gray-900 border-gray-700 text-gray-100" opacity={1}>
                <div className="p-1">
                  <p className="font-bold text-sm text-white flex items-center"><Crosshair className="w-4 h-4 mr-1 text-gray-400" /> {node.mockName}</p>
                  <p className="text-xs text-gray-400 mt-1">Role: {node.mockRole}</p>
                  <p className="text-xs font-mono mt-1" style={{ color: getRiskColorHex(node.riskScore) }}>Risk Score: {node.gap_finder?.fraud_score}</p>
                </div>
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div className="absolute top-0 left-0 right-0 z-10 px-6 py-4 flex items-start justify-between pointer-events-none">
        <div className="bg-gray-950/80 border border-gray-800/80 backdrop-blur-md rounded-xl p-4 shadow-xl pointer-events-auto transition-all">
          <h1 className="text-2xl font-extrabold text-white flex items-center">
            <Network className="w-7 h-7 mr-3 text-blue-500" />
            FRAUD <span className="text-blue-500 ml-2">SIMULATION</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1 uppercase tracking-widest flex items-center"><Activity className="w-3 h-3 mr-1 text-green-500" /> Sync: {lastSync}</p>
        </div>

        <div className="flex space-x-4 pointer-events-auto">
          {[
            { label: 'Total Entities', val: nodes.length, color: 'text-white' },
            { label: 'High Risk', val: nodes.filter(n => n.riskScore >= 70).length, color: 'text-red-500' },
            { label: 'Syndicate Rings', val: clusters.length, color: 'text-orange-500' },
            { label: 'Connections', val: edges.length, color: 'text-blue-400' },
          ].map((kpi, i) => (
            <div key={i} className="bg-gray-950/80 border border-gray-800/80 backdrop-blur-md rounded-xl px-5 py-3 shadow-xl min-w-[120px] text-center">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{kpi.label}</p>
              <p className={`text-2xl font-light mt-1 ${kpi.color}`}>{kpi.val}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute left-6 top-32 z-10 w-64 space-y-4 pointer-events-auto">
        <div className="bg-gray-900/90 border border-gray-700/80 backdrop-blur-md rounded-xl p-4 shadow-2xl">
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest border-b border-gray-800 pb-2 mb-3 flex items-center"><Layers className="w-4 h-4 mr-2 text-gray-400" /> Map Layers</h3>
          <div className="space-y-3">
            {[
              { label: 'Entity Nodes', state: showNodes, setter: setShowNodes },
              { label: 'Network Links', state: showLinks, setter: setShowLinks },
              { label: 'Syndicate Rings', state: showRings, setter: setShowRings }
            ].map(layer => (
              <label key={layer.label} className="flex items-center space-x-3 cursor-pointer group">
                <input type="checkbox" checked={layer.state} onChange={(e) => layer.setter(e.target.checked)} className="form-checkbox h-4 w-4 text-blue-500 bg-gray-800 border-gray-700 rounded focus:ring-0 focus:ring-offset-0" />
                <span className="text-sm text-gray-400 group-hover:text-white transition-colors">{layer.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-gray-900/90 border border-gray-700/80 backdrop-blur-md rounded-xl p-4 shadow-2xl">
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest border-b border-gray-800 pb-2 mb-3 flex items-center"><Clock className="w-4 h-4 mr-2 text-gray-400" /> Temporal Filter</h3>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {['24H', '7D', '14D', '30D'].map(t => (
              <button key={t} onClick={() => setTimeRange(t)} className={`py-1 text-xs font-bold rounded ${timeRange === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                {t}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 text-center">Simulated timeline scrub</p>
        </div>
      </div>

      <div className="absolute right-6 top-32 bottom-24 z-10 w-80 flex flex-col pointer-events-auto">
        {!selectedCluster ? (
          <div className="bg-gray-900/90 border border-red-900/50 backdrop-blur-md rounded-xl p-5 shadow-[0_0_20px_rgba(239,68,68,0.1)] flex-1 overflow-y-auto custom-scrollbar">
            <h3 className="text-sm font-bold text-red-500 uppercase tracking-widest border-b border-red-900/50 pb-3 mb-4 flex items-center"><ShieldAlert className="w-5 h-5 mr-2" /> Live Alerts</h3>
            <div className="space-y-4">
              {alertsFeed.map((alt, i) => (
                <div key={i} className="border-l-2 border-gray-700 pl-3">
                  <p className={`text-sm font-bold ${alt.color}`}>{alt.title}</p>
                  <p className="text-xs text-gray-400 mt-1">{alt.desc}</p>
                  <p className="text-[10px] text-gray-600 mt-2 flex items-center"><Clock className="w-3 h-3 mr-1" /> {alt.time}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-gray-950 border border-blue-900/50 backdrop-blur-md rounded-xl flex-1 flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 bg-gray-900 border-b border-gray-800 flex justify-between items-start">
              <div>
                <h3 className="text-xs text-gray-400 uppercase tracking-widest font-bold">Syndicate Ring</h3>
                <p className="text-lg font-mono text-white mt-1 uppercase">{selectedCluster.id}</p>
              </div>
              <button onClick={() => setSelectedCluster(null)} className="p-1.5 bg-gray-800 text-gray-400 hover:text-white rounded-full transition-colors"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto custom-scrollbar">
              <div className="mb-6">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-gray-400 uppercase">Ring Threat Level</span>
                  <span className={`text-sm font-bold font-mono ${selectedCluster.risk >= 70 ? 'text-red-500' : 'text-yellow-500'}`}>{selectedCluster.risk} / 100</span>
                </div>
                <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                  <div className={`h-full ${selectedCluster.risk >= 70 ? 'bg-red-500' : 'bg-yellow-500'}`} style={{ width: `${selectedCluster.risk}%` }}></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-900 p-3 rounded-lg border border-gray-800">
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Total Nodes</p>
                  <p className="text-xl text-white font-light">{selectedCluster.count}</p>
                </div>
                <div className="bg-gray-900 p-3 rounded-lg border border-gray-800">
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Origin Area</p>
                  <p className="text-xs text-white uppercase mt-1 truncate">{selectedCluster.locStr}</p>
                </div>
              </div>

              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-800 pb-2">Identified Members</h4>
              <div className="space-y-2">
                {selectedCluster.members.map((m: any) => (
                  <div key={m.id} className="p-3 bg-gray-900 rounded border border-gray-800 flex justify-between items-center hover:bg-gray-800 cursor-pointer transition-colors" onClick={() => navigate(`/claim/${m.id}`)}>
                    <div>
                      <p className="text-sm font-bold text-gray-200">{m.mockName}</p>
                      <p className="text-[10px] text-gray-500 uppercase mt-0.5">{m.mockRole} • {m.id.substring(0,8)}...</p>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${m.riskScore >= 70 ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-800 bg-gray-900">
                <button className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-widest rounded transition-colors shadow">Initiate Countermeasures</button>
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-6 left-6 right-80 ml-64 z-10 flex space-x-6 pointer-events-none transition-all">
        <div className="bg-gray-950/90 border border-gray-800/80 backdrop-blur-md rounded-xl p-4 shadow-2xl flex-1 flex items-center pointer-events-auto h-24">
            <div className="w-32 mr-6 border-r border-gray-800 pr-4">
                <h3 className="text-xs text-gray-400 uppercase font-bold tracking-widest mb-1">Network Traffic</h3>
                <p className="text-2xl font-light text-white">{trafficData.length > 0 ? trafficData[trafficData.length - 1].val.toFixed(1) : '0.0'}k</p>
                <p className="text-[10px] text-green-500 flex items-center"><RefreshCw className="w-2 h-2 mr-1 animate-spin" /> LIVE STREAM</p>
            </div>
            <div className="flex-1 h-full min-h-[60px] pt-2" style={{ minWidth: "150px" }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trafficData}>
                        <Line type="monotone" dataKey="val" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={true} animationDuration={500} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>

        <div className="bg-gray-950/90 border border-gray-800/80 backdrop-blur-md rounded-xl p-4 shadow-2xl flex-1 flex items-center pointer-events-auto h-24">
             <div className="w-32 mr-6 border-r border-gray-800 pr-4">
                <h3 className="text-xs text-gray-400 uppercase font-bold tracking-widest mb-1">Intercepts</h3>
                <p className="text-2xl font-light text-white">{interceptsData.length > 0 ? interceptsData[interceptsData.length - 1].val : '0'}</p>
                <p className="text-[10px] text-red-500 animate-pulse">Critical Load</p>
            </div>
            <div className="flex-1 h-full min-h-[60px] pt-2" style={{ minWidth: "150px" }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={interceptsData}>
                        <Line type="monotone" dataKey="val" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={true} animationDuration={500} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #4b5563; }
        .animate-spin-slow { animation: spin 30s linear infinite; transform-origin: center; }
        .leaflet-container { background: #0a0a0a !important; }
      `}</style>
    </div>
  );
}
