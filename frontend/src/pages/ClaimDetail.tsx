import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Smartphone, Battery, Activity, Radio, ShieldAlert, CheckCircle, AlertTriangle } from 'lucide-react';
import type { Claim } from './Dashboard';
import GapFinderPanel from '../components/GapFinderPanel';
import GaugeChart from '../components/GaugeChart';

const getInitials = (name?: string) => {
  if (!name) return 'UN';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

export default function ClaimDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [claim, setClaim] = useState<Claim | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [weatherData, setWeatherData] = useState<string>('Loading environment data...');

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${import.meta.env.VITE_API_URL}/api/claims/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error("Claim not found");
        return res.json();
      })
      .then((data: Claim) => {
        setClaim(data);
        fetch(`${import.meta.env.VITE_API_URL}/api/weather/${data.gps_coords.lat}/${data.gps_coords.lng}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
          .then(wRes => wRes.json())
          .then(wData => setWeatherData(wData.data))
          .catch(() => setWeatherData("Weather API unavailable"));
      })
      .catch(err => setError(err.message));
  }, [id]);

  const handleAnalyse = () => {
    if (!claim) return;
    setAnalyzing(true);
    const token = localStorage.getItem('token');
    fetch(`${import.meta.env.VITE_API_URL}/api/analyse/${claim.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          setClaim(data.claim);
        }
        setAnalyzing(false);
      })
      .catch(err => {
        console.error("Analyse failed", err);
        setAnalyzing(false);
      });
  };

  if (error) return <div className="p-8 text-red-500 flex items-center min-h-screen bg-gray-950"><ShieldAlert className="mr-3" /> {error}</div>;
  if (!claim) return <div className="p-8 text-white flex items-center min-h-screen bg-gray-950"><Activity className="animate-spin mr-3" /> Loading Claim Telemetry...</div>;

  const getStatusIcon = () => {
    switch (claim.gap_finder.verdict) {
      case 'approve': return <CheckCircle className="w-10 h-10 text-green-500" />;
      case 'soft_verify': return <AlertTriangle className="w-10 h-10 text-yellow-500" />;
      case 'hold': return <ShieldAlert className="w-10 h-10 text-red-500" />;
    }
  };

  return (
    <div className="p-8 space-y-6 bg-gray-950 min-h-screen">

      <header className="flex items-center justify-between pb-4 border-b border-gray-800">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/')} className="p-2 bg-gray-900 border border-gray-700 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center">
              Claim <span className="text-blue-500 ml-3 mr-3">{claim.id}</span>
            </h1>
            <p className="text-gray-400 text-sm mt-1">Processed: {new Date(claim.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {getStatusIcon()}
          <div className="text-right">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">Final Verdict</p>
            <p className={`text-xl font-bold uppercase ${claim.gap_finder.verdict === 'approve' ? 'text-green-500' : claim.gap_finder.verdict === 'soft_verify' ? 'text-yellow-500' : 'text-red-500'}`}>
              {claim.gap_finder?.verdict ? claim.gap_finder.verdict.replace('_', ' ') : 'UNKNOWN'}
            </p>
          </div>
          <button
            onClick={handleAnalyse}
            disabled={analyzing}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 px-6 rounded shadow transition ml-4 flex items-center"
          >
            {analyzing ? <><Activity className="w-5 h-5 mr-2 animate-spin" /> Analysing...</> : "Analyse"}
          </button>
        </div>
      </header>

      {/* FULL WORKER IDENTITY LAYER */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between">
        <div className="flex items-center space-x-6">
          <div className="w-20 h-20 rounded-full bg-blue-900/50 border-2 border-blue-500 flex items-center justify-center text-blue-400 text-3xl font-extrabold tracking-widest shadow-[0_0_15px_rgba(59,130,246,0.2)]">
            {getInitials(claim.worker_name)}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-wide">{claim.worker_name || 'Unknown Worker'}</h2>
            <div className="flex flex-wrap items-center space-x-4 mt-2 text-sm text-gray-400 font-medium">
              <span className="flex items-center">Age: {claim.worker_age || 'N/A'}</span>
              <span className="flex items-center"><Smartphone className="w-4 h-4 mr-1.5" /> Ph: {claim.worker_phone || 'N/A'}</span>
              <span className="font-mono bg-gray-950 px-2 py-0.5 rounded border border-gray-800 text-gray-500">ID: {claim.worker_id}</span>
            </div>
            <p className="text-xs text-blue-400/80 mt-2 font-bold tracking-wide">Member since: {claim.worker_registered_at ? new Date(claim.worker_registered_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown'}</p>
          </div>
        </div>
        <div className="text-right mt-6 md:mt-0">
          <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-2">Platform Trust</p>
          <div className="inline-block px-4 py-1.5 bg-green-900/30 text-green-400 border border-green-800 rounded font-bold uppercase text-sm shadow-sm ring-1 ring-green-500/50">
            Verified Contractor
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 border-b border-gray-800 pb-2">Device Telemetry Logs</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center text-gray-300"><MapPin className="w-4 h-4 mr-3 text-gray-500" /> GPS Coords</div>
                <div className="font-mono text-sm text-blue-400">[{claim.gps_coords.lat}, {claim.gps_coords.lng}]</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center text-gray-300"><Activity className="w-4 h-4 mr-3 text-gray-500" /> Accel Variance</div>
                <div className="font-mono text-sm text-white">{claim.signals.accelerometer_variance} g</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center text-gray-300"><Radio className="w-4 h-4 mr-3 text-gray-500" /> Cell Handoffs</div>
                <div className="font-mono text-sm text-white">{claim.signals.cell_tower_handoffs} events</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center text-gray-300"><Smartphone className="w-4 h-4 mr-3 text-gray-500" /> Ambient Noise</div>
                <div className="font-mono text-sm text-white">{claim.signals.ambient_noise_db ? `${claim.signals.ambient_noise_db} dB` : 'NULL'}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center text-gray-300"><Battery className="w-4 h-4 mr-3 text-gray-500" /> Battery Level</div>
                <div className="font-mono text-sm text-white">{claim.signals.battery_level}%</div>
              </div>
            </div>

            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 mt-8 border-b border-gray-800 pb-2">Environment Data</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center text-gray-300">Weather API</div>
                <div className="font-mono text-sm text-white">{weatherData}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center text-gray-300">Regional Outage</div>
                <div className={`font-mono text-sm font-bold ${claim.environment.regional_outage_reported ? 'text-red-400' : 'text-green-400'}`}>
                  {claim.environment.regional_outage_reported ? 'REPORTED' : 'CLEAR'}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-0 shadow-lg overflow-hidden">
            <div className="p-6 border-b border-gray-800">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest text-center">Score Confidence</h3>
            </div>
            <div className="p-4 bg-gray-950/50">
              <GaugeChart score={claim.gap_finder.fraud_score} />
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <GapFinderPanel
            q1Answer={claim.gap_finder.q1_gaps}
            q2Answer={claim.gap_finder.q2_blindspot}
            q3Answer={claim.gap_finder.q3_false_positive}
            q4Answer={claim.gap_finder.q4_reasoning_audit}
            isLoading={analyzing}
          />
        </div>

      </div>
    </div>
  );
}
