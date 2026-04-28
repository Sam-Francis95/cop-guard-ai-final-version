import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FileText, Download, UserCheck, AlertTriangle } from 'lucide-react';
import type { Claim } from './Dashboard';

export default function TransparencyReport() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const { id } = useParams();

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${import.meta.env.VITE_API_URL}/api/claims`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setClaims(data);
        }
      })
      .catch(err => console.error("Failed to fetch claims:", err));
  }, []);

  if (!id) {
    return (
      <div className="p-8 bg-gray-950 min-h-screen">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-6 flex items-center"><FileText className="w-8 h-8 mr-4 text-blue-500" /> Worker Transparency Portal</h1>
          <p className="text-gray-400 mb-8">Select a claim to generate a plain-language explanation of the AI verdict.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {claims.map(c => (
              <Link key={c.id} to={`/transparency/${c.id}`} className="block bg-gray-900 p-5 flex items-center justify-between rounded-lg border border-gray-800 hover:border-blue-500/50 transition-colors">
                <div>
                  <p className="text-white font-bold text-lg">{c.worker_name || 'Unknown Worker'}</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-gray-400 text-xs">{c.worker_age} y/o</span>
                    <span className="text-gray-600 text-xs">•</span>
                    <span className="text-gray-400 text-xs font-mono">Ph: {c.worker_phone}</span>
                  </div>
                  <p className="text-gray-500 text-xs mt-2 border-t border-gray-800 pt-2 flex items-center justify-between">
                    <span className="font-mono text-blue-400/80">{c.id}</span>
                    <span>{new Date(c.timestamp).toLocaleDateString()}</span>
                  </p>
                </div>
                <div className="text-gray-600"><FileText className="w-5 h-5" /></div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const claim = claims.find(c => c.id === id);
  if (!claim) return <div className="p-8 text-white">Loading Report...</div>;

  return (
    <div className="p-8 bg-gray-950 min-h-screen flex justify-center py-12">
      <div className="bg-gray-100 max-w-2xl w-full rounded-xl shadow-2xl overflow-hidden font-sans text-gray-900 border border-gray-300">
        <div className="bg-blue-900 p-8 text-white flex justify-between items-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-4 -translate-y-4">
            <FileText className="w-48 h-48" />
          </div>
          <div className="relative z-10 w-full flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">CopGuard Transparency Report</h1>
              <p className="text-blue-300 mt-1 font-mono">{claim.worker_name} ({claim.worker_age} y/o) • Claim {claim.id}</p>
            </div>
          </div>
        </div>

        <div className="p-10 space-y-8 bg-white">
          <section>
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3 border-b border-gray-200 pb-2 flex items-center"><AlertTriangle className="w-4 h-4 mr-2" /> Why was my claim reviewed?</h2>
            <p className="text-gray-800 leading-relaxed font-medium text-lg bg-blue-50 p-5 rounded-lg border border-blue-100">
              "{claim.gap_finder.worker_report}"
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3 border-b border-gray-200 pb-2">Signals Flagged</h2>
            {claim.gap_finder.q1_gaps && claim.gap_finder.q1_gaps.trim() !== "" && !claim.gap_finder.q1_gaps.includes("No critical signal gaps") ? (
              <div className="flex items-center text-red-600 font-bold bg-red-50 p-4 rounded-md border border-red-100">
                <AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0" /> {claim.gap_finder.q1_gaps}
              </div>
            ) : (
              <div className="flex items-center text-green-700 font-bold bg-green-50 p-4 rounded-md border border-green-200"><UserCheck className="w-5 h-5 mr-3 flex-shrink-0" /> No critical missing data points detected. Telemetry was intact.</div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3 border-b border-gray-200 pb-2">Final Verdict</h2>
            <div className={`p-5 rounded-lg border-2 shadow-sm ${claim.gap_finder.verdict === 'approve' ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
              <p className="font-extrabold uppercase tracking-widest text-xl mb-2">{claim.gap_finder?.verdict ? claim.gap_finder.verdict.replace('_', ' ') : 'UNKNOWN'}</p>
              <p className="text-sm font-medium opacity-80">This decision was formulated with a <strong>{claim.gap_finder.confidence.toUpperCase()}</strong> confidence level by our Gap Finder AI Engine.</p>
            </div>
          </section>
        </div>

        <div className="bg-gray-50 border-t border-gray-200 p-6 flex justify-between items-center">
          <p className="text-xs text-gray-400 font-mono">Report Generated: {new Date().toLocaleDateString()}</p>
          <button className="flex items-center bg-white border border-gray-300 shadow hover:bg-gray-50 text-gray-700 font-bold py-2 px-4 rounded transition-colors">
            <Download className="w-4 h-4 mr-2" /> Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}
