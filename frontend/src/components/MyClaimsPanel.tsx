import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Send, CheckCircle, XCircle, Loader, BrainCircuit } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function MyClaimsPanel({ refreshKey = 0 }) {
  const [activeTab, setActiveTab] = useState('ALL');
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchClaims = useCallback(async () => {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) return;
      
      const user = JSON.parse(userStr);
      if (!user.phone) return;

      const url = `${import.meta.env.VITE_NODE_API_URL || 'http://localhost:5001'}/api/claims?workerId=${user.phone}`;
      const res = await fetch(url);
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      if (data.success) {
        setClaims(data.claims || []);
      }
    } catch (err) {
      console.error('[MyClaimsPanel] Error fetching claims:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClaims();
    // Enforce strict 5 second polling explicitly requested natively
    const id = setInterval(fetchClaims, 5000);
    return () => clearInterval(id);
  }, [fetchClaims, refreshKey]);

  const filteredClaims = activeTab === 'ALL' 
    ? claims 
    : claims.filter(c => c.status === activeTab);

  const StatusIcon = ({ status }) => {
    switch(status) {
      case 'APPROVED': return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'REJECTED': return <XCircle className="w-4 h-4 text-red-400" />;
      case 'PENDING': return <Clock className="w-4 h-4 text-yellow-400" />;
      default: return <Send className="w-4 h-4 text-blue-400" />;
    }
  };

  if (loading && claims.length === 0) {
    return (
      <div className="flex justify-center items-center h-48">
        <Loader className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl mt-6 p-6 shadow-xl">
      <div className="flex items-center justify-between mb-6 border-b border-gray-800 pb-4">
        <h2 className="text-xl font-bold font-mono text-gray-100 flex items-center gap-2">
          My Claim History
          <span className="bg-blue-900/50 text-blue-400 text-xs px-2 py-0.5 rounded-full border border-blue-800/50">
             {claims.length} Total
          </span>
        </h2>
      </div>

      <div className="flex space-x-2 mb-6 overflow-x-auto pb-2 scrollbar-none">
        {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap
              ${activeTab === tab 
                ? 'bg-blue-600 text-white shadow-lg border border-blue-500' 
                : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
              }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <AnimatePresence>
          {filteredClaims.length === 0 ? (
             <div className="text-center py-8 text-gray-500">No claims match the filter.</div>
          ) : (
            filteredClaims.map((claim) => (
              <motion.div
                key={claim._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-gray-800/50 border border-gray-700 rounded-lg p-4"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="text-sm font-bold text-gray-200">
                      [{claim.claimId}] {claim.issueType}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(claim.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-900/60 rounded-full border border-gray-700 text-xs font-semibold">
                     <StatusIcon status={claim.status} /> {claim.status}
                  </div>
                </div>

                <div className="mt-2 text-sm text-gray-300">
                  <p>Description: {claim.description}</p>
                </div>

                {claim.aiReason && (
                   <div className="mt-3 p-3 bg-purple-900/10 border border-purple-500/20 rounded-md">
                      <div className="flex items-center gap-2 mb-1 text-purple-400 text-xs font-bold">
                         <BrainCircuit className="w-4 h-4"/> AI Reasoning Engine (Confidence: {claim.aiConfidence}%)
                      </div>
                      <p className="text-sm text-purple-200">{claim.aiReason}</p>
                   </div>
                )}
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
