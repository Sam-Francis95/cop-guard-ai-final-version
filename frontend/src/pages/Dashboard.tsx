import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle, ShieldAlert, Clock, Activity, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import AdminAIClaimsPanel from './AdminAIClaimsPanel';

export interface Claim {
  id: string;
  worker_id: string;
  worker_name?: string;
  worker_age?: string | number;
  worker_phone?: string;
  worker_registered_at?: string;
  timestamp: string;
  gps_coords: { lat: number; lng: number };
  signals: any;
  environment: any;
  gap_finder: {
    fraud_score: number;
    verdict: 'approve' | 'soft_verify' | 'hold';
    confidence: 'high' | 'medium' | 'low';
    worker_report: string;
    q1_gaps: string;
    q2_blindspot: string;
    q3_false_positive: string;
    q4_reasoning_audit: string;
    score_adjustments: number;
  };
}

export default function Dashboard() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchClaims = () => {
      const token = localStorage.getItem('token');
      fetch(`${import.meta.env.VITE_API_URL}/api/claims`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => {
          if (!res.ok) throw new Error("Failed to fetch");
          return res.json();
        })
        .then(data => {
          const rawClaims = Array.isArray(data) ? data : (data.claims || []);
          const mappedClaims = rawClaims.map((c: any) => ({
            ...c,
            id: c.id || c.claim_id,
            timestamp: c.timestamp || c.created_at || new Date().toISOString(),
            gps_coords: c.gps_coords || { lat: c.location_lat || 0, lng: c.location_lng || 0 },
            gap_finder: c.gap_finder || {
              fraud_score: c.fraud_score ?? c.risk_score ?? 0,
              verdict: c.status === 'APPROVED' ? 'approve' : c.status === 'REJECTED' ? 'hold' : 'soft_verify'
            }
          }));
          setClaims(mappedClaims);
          setError(null);
          setLoading(false);
        })
        .catch(err => {
          console.error("Failed to fetch claims:", err);
          setError("Failed to load claims stream. Ensure the backend is active.");
          setLoading(false);
        });
    };

    fetchClaims();
    const interval = setInterval(fetchClaims, 30000);
    return () => clearInterval(interval);
  }, []);

  const total = claims.length;
  const approved = claims.filter(c => c.gap_finder.verdict === 'approve').length;
  const held = claims.filter(c => c.gap_finder.verdict === 'hold').length;
  const autoApprovePct = total > 0 ? Math.round((approved / total) * 100) : 0;

  const checkSyndicate = () => {
    if (claims.length < 4) return false;
    for (let i = 0; i <= claims.length - 4; i++) {
      const window = claims.slice(i, i + 4);
      const newest = new Date(window[0].timestamp).getTime();
      const oldest = new Date(window[3].timestamp).getTime();
      if ((newest - oldest) < 5 * 60 * 1000) {
        return true;
      }
    }
    return false;
  };
  const syndicateActive = checkSyndicate();

  if (loading) return <div className="p-8 text-gray-400 flex items-center min-h-screen bg-gray-950"><Activity className="animate-spin mr-3" /> Loading SOC Dashboard...</div>;
  if (error) return <div className="p-8 text-red-500 flex items-center min-h-screen bg-gray-950"><ShieldAlert className="mr-3" /> {error}</div>;

  return (
    <div className="p-8 space-y-8 bg-gray-950 min-h-screen">

      <header className="flex justify-between items-center pb-4 border-b border-gray-800">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Parametric Claim Feed</h1>
          <p className="text-gray-400 text-sm mt-1">AI-Powered Rapid Triaging active on {total} nodes</p>
        </div>
        <div className="px-4 py-2 bg-gray-900 rounded-full border border-gray-700 font-mono text-sm text-yellow-500 flex items-center shadow-inner">
          <Search className="w-4 h-4 mr-2" />
          Gap Finder Engine ONLINE
        </div>
      </header>

      {syndicateActive && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-900/40 border border-red-500 rounded-lg p-5 flex items-center justify-between shadow-[0_0_20px_rgba(239,68,68,0.2)] animate-pulse"
        >
          <div className="flex items-center space-x-4">
            <ShieldAlert className="w-10 h-10 text-red-500" />
            <div>
              <h2 className="text-red-400 font-bold text-lg uppercase tracking-wider">Syndicate Ring Detected</h2>
              <p className="text-red-200/70 text-sm mt-1">4+ anomalous claims intercepted within a 5-minute spatial window (Risk Factor: Critical).</p>
            </div>
          </div>
          <button onClick={() => navigate('/syndicate')} className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-bold rounded shadow transition-all">
            Isolate Network
          </button>
        </motion.div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 shadow-lg">
          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">Total Claims</p>
          <p className="text-5xl font-light text-white">{total}</p>
        </div>
        <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 shadow-lg">
          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">Auto-Approved</p>
          <div className="flex items-baseline space-x-2">
            <p className="text-5xl font-light text-green-500">{autoApprovePct}%</p>
            <p className="text-gray-500 text-sm">({approved})</p>
          </div>
        </div>
        <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 shadow-lg">
          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">Flagged count</p>
          <p className="text-5xl font-light text-red-500">{held}</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center"><Clock className="w-4 h-4 mr-2" /> Live Stream</h3>
        <div className="space-y-3">
          {claims.length === 0 ? (
            <div className="p-10 border border-gray-800 rounded-xl text-center">
              <Activity className="w-12 h-12 text-gray-700 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-400">No active claims in stream.</h2>
            </div>
          ) : (
            claims.map((claim) => (
              <div
                key={claim.id}
                onClick={() => navigate(`/claim/${claim.id}`)}
                className="bg-gray-900/80 border border-gray-800 rounded-lg p-5 flex items-center justify-between cursor-pointer hover:bg-gray-800 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <div className="flex items-center space-x-6">
                  {claim.gap_finder.verdict === 'approve' && <CheckCircle className="text-green-500 w-8 h-8 flex-shrink-0" />}
                  {claim.gap_finder.verdict === 'soft_verify' && <AlertTriangle className="text-yellow-500 w-8 h-8 flex-shrink-0" />}
                  {claim.gap_finder.verdict === 'hold' && <ShieldAlert className="text-red-500 w-8 h-8 flex-shrink-0" />}

                  <div>
                    <p className="text-gray-100 font-bold text-lg">{claim.worker_name || 'Unknown Worker'}</p>
                    <p className="text-gray-400 text-xs mt-0.5">Age: {claim.worker_age || 'N/A'}</p>
                    <p className="text-gray-400 text-xs mt-0.5">Ph: {claim.worker_phone || 'N/A'}</p>
                    <p className="text-gray-600 text-xs mt-1 font-mono">ID: {claim.worker_id} | {claim.id}</p>
                    <p className="text-gray-500 text-xs mt-2 flex items-center"><Clock className="w-3 h-3 mr-1" /> {new Date(claim.timestamp).toLocaleString()} • GPS: [{claim.gps_coords.lat}, {claim.gps_coords.lng}]</p>
                  </div>
                </div>

                <div className="flex items-center space-x-8">
                  <div className="text-right">
                    <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Fraud Score</p>
                    <p className={`text-xl font-bold font-mono ${claim.gap_finder.fraud_score > 70 ? 'text-red-500' : claim.gap_finder.fraud_score > 30 ? 'text-yellow-500' : 'text-green-500'}`}>
                      {claim.gap_finder.fraud_score} / 100
                    </p>
                  </div>
                  <div className={`px-4 py-1.5 rounded text-xs font-bold uppercase ${claim.gap_finder.verdict === 'approve' ? 'bg-green-900/30 text-green-400 border border-green-800/50' : claim.gap_finder.verdict === 'soft_verify' ? 'bg-yellow-900/30 text-yellow-500 border border-yellow-800/50' : 'bg-red-900/30 text-red-500 border border-red-800/50'}`}>
                    {claim.gap_finder?.verdict ? claim.gap_finder.verdict.replace('_', ' ') : 'UNKNOWN'}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* AI Autonomous Claims Section */}
      <div className="mt-12 border-t border-gray-800 pt-8">
        <AdminAIClaimsPanel />
      </div>
    </div>
  );
}
