import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle, XCircle, AlertCircle, Loader, DollarSign, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PaymentModal from '../components/PaymentModal';

export default function AdminAIClaimsPanel() {
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<any | null>(null);

  const fetchClaims = async () => {
    try {
      const params = new URLSearchParams();
      if (activeFilter !== 'ALL') {
        params.append('status', activeFilter);
      }

      const response = await fetch(`http://localhost:5001/api/claims?${params}`);
      if (!response.ok) throw new Error('Failed to fetch claims');
      const data = await response.json();
      setClaims(data.claims || []);
    } catch (error) {
      console.error('Error fetching claims:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClaims();
    const interval = setInterval(fetchClaims, 5000);
    return () => clearInterval(interval);
  }, [activeFilter]);

  const handleAdminAction = async (claimId: string, action: 'APPROVE' | 'REJECT' | 'HOLD') => {
    setActionInProgress(claimId);
    try {
      const response = await fetch(`http://localhost:5001/api/claims/${claimId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: action === 'HOLD' ? 'HOLD' : action === 'APPROVE' ? 'APPROVED' : 'REJECTED' })
      });

      if (response.ok) {
        fetchClaims();
      }
    } catch (error) {
      console.error('Error performing action:', error);
    } finally {
      setActionInProgress(null);
    }
  };

  const handlePayNow = (claim: any) => {
    setSelectedClaim({
        ...claim,
        claim_id: claim._id,
        worker_name: claim.workerName,
        payout_amount: claim.amount ? claim.amount * 100 : 0, 
    });
    setIsPaymentModalOpen(true);
  };

  const handleUPIPayment = () => {
    setIsPaymentModalOpen(false);
  };

  const handleMarkAsPaid = async (claimId: string) => {
    setClaims(prev => prev.map(c => c._id === claimId ? { ...c, status: 'PAID' } : c));
    setIsPaymentModalOpen(false);

    try {
      await fetch(`http://localhost:5001/api/claims/${claimId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PAID' })
      });
    } catch (error) {
      console.error('Error marking as paid:', error);
    }
  };

  const handleRazorpayPayment = async () => {
    if (!selectedClaim) return;
    handleMarkAsPaid(selectedClaim.claim_id);
  };

  const filteredClaims = activeFilter === 'ALL' ? claims : claims.filter(c => c.status === activeFilter);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-yellow-950/40 text-yellow-500 border-yellow-700 blur-[0.3px]';
      case 'APPROVED': return 'bg-green-950/40 text-green-500 border-green-700';
      case 'REJECTED': return 'bg-red-950/40 text-red-500 border-red-700';
      case 'PAID': return 'bg-blue-950/40 text-blue-500 border-blue-700';
      case 'HOLD': return 'bg-orange-950/40 text-orange-500 border-orange-700';
      default: return 'bg-gray-950/40 text-gray-500 border-gray-700';
    }
  };

  if (loading && claims.length === 0) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-gray-100 p-8 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-900 border border-gray-800 p-6 rounded-xl shadow-lg">
        <div className="flex items-center gap-4">
          <div className="bg-blue-900/30 p-3 rounded-lg border border-blue-800/50">
            <ShieldAlert className="w-8 h-8 text-blue-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Trust & Claims SOC</h1>
            <p className="text-gray-400 mt-1">Review and manage worker claims (Polling automatically)</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'HOLD', 'PAID'].map(status => (
          <button
            key={status}
            onClick={() => setActiveFilter(status)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${activeFilter === status
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/50'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Claims Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AnimatePresence>
          {filteredClaims.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <AlertCircle className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500">No claims found</p>
            </div>
          ) : (
            filteredClaims.map((claim) => (
              <motion.div
                key={claim._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`border-2 rounded-lg p-4 transition-all ${getStatusColor(claim.status)}`}
              >
                {/* Claim Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-mono text-xs text-gray-400">{claim.claimId}</p>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-900 border border-blue-500 text-blue-100">SRC: {claim.source}</span>
                      {claim.duplicate && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-900 text-red-100">DUPLICATE DETECTED</span>
                      )}
                    </div>
                    <p className="text-white font-semibold text-lg">{claim.workerName} <span className="text-sm font-normal text-gray-400">({claim.workerId})</span></p>
                    <p className="text-xs text-blue-400 mb-1">{claim.workerEmail}</p>
                    <p className="text-xs text-gray-500 font-mono">{new Date(claim.createdAt).toLocaleString()} | GPS: [{claim.location?.lat}, {claim.location?.lng}]</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ring-1 ring-inset whitespace-nowrap bg-gray-950`}>
                    {claim.status}
                  </span>
                </div>

                {/* Core Metrics & QR */}
                <div className="flex gap-4 mb-3 p-3 bg-gray-950/50 rounded border border-gray-800">
                  <div className="w-16 h-16 shrink-0 bg-white rounded flex items-center justify-center p-1">
                     {claim.qrCode ? (
                        <img src={claim.qrCode.startsWith('data:') ? claim.qrCode : `http://localhost:5001${claim.qrCode}`} alt="QR" className="w-full h-full object-contain" />
                     ) : (
                        <span className="text-[10px] text-red-500 font-bold text-center">NO QR</span>
                     )}
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-500">Issue Type</p>
                      <p className="text-sm font-bold text-gray-200">{String(claim.issueType).toUpperCase()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">AI Confidence</p>
                      <p className="text-sm font-bold text-purple-400">{claim.aiConfidence ? `${claim.aiConfidence}%` : 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {claim.description && (
                  <div className="mb-4 bg-gray-950/30 p-3 rounded text-sm text-gray-300 border border-gray-800">
                    <span className="text-gray-500 text-xs font-semibold block mb-1">Description:</span>
                    {claim.description}
                  </div>
                )}
                
                {claim.aiReason && (
                  <div className="mb-4 bg-purple-950/30 p-3 rounded text-sm border-l-2 border-purple-500">
                    <span className="text-purple-400 text-xs font-semibold block mb-1">AI Reasoning Log:</span>
                    <span className="font-bold text-purple-300">{claim.aiReason}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-800/50">
                  <button
                    onClick={() => handleAdminAction(claim._id, 'APPROVE')}
                    disabled={actionInProgress === claim._id || claim.status === 'APPROVED' || claim.status === 'PAID'}
                    className="flex-1 px-3 py-2 bg-green-700 hover:bg-green-600 border border-green-800 disabled:opacity-30 disabled:hover:bg-green-700 rounded text-xs font-semibold text-white transition-colors flex items-center justify-center"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" /> Approve
                  </button>
                  <button
                    onClick={() => handleAdminAction(claim._id, 'HOLD')}
                    disabled={actionInProgress === claim._id || claim.status === 'HOLD' || claim.status === 'PAID'}
                    className="flex-1 px-3 py-2 bg-orange-700 hover:bg-orange-600 border border-orange-800 disabled:opacity-30 disabled:hover:bg-orange-700 rounded text-xs font-semibold text-white transition-colors flex items-center justify-center"
                  >
                    <Clock className="w-4 h-4 mr-1" /> Hold
                  </button>
                  <button
                    onClick={() => handleAdminAction(claim._id, 'REJECT')}
                    disabled={actionInProgress === claim._id || claim.status === 'REJECTED' || claim.status === 'PAID'}
                    className="flex-1 px-3 py-2 bg-red-700 hover:bg-red-600 border border-red-800 disabled:opacity-30 disabled:hover:bg-red-700 rounded text-xs font-semibold text-white transition-colors flex items-center justify-center"
                  >
                    <XCircle className="w-4 h-4 mr-1" /> Reject
                  </button>
                </div>

                {/* Payment Section */}
                {claim.status === 'APPROVED' && (
                  <div className="mt-3 pt-3 border-t border-gray-800">
                    <button
                        onClick={() => handlePayNow(claim)}
                        className="w-full px-3 py-2 bg-blue-700 hover:bg-blue-600 rounded text-xs font-bold text-white transition-colors flex items-center justify-center gap-2"
                      >
                        <DollarSign className="w-4 h-4" />
                        Pay Now (₹{claim.amount})
                    </button>
                  </div>
                )}
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Payment Modal */}
      {selectedClaim && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          claim={selectedClaim}
          onUPIPayment={handleUPIPayment}
          onRazorpayPayment={handleRazorpayPayment}
          onMarkAsPaid={handleMarkAsPaid}
          isProcessing={false}
        />
      )}
    </div>
  );
}
