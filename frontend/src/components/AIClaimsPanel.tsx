import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, XCircle, Clock, MapPin, Zap } from 'lucide-react';

interface BackendAIClaim {
  id?: number;
  claim_id: string;
  worker_id: string;
  worker_name?: string;
  full_name?: string;
  timestamp?: string;
  created_at?: string;
  location_lat?: number;
  location_lng?: number;
  location?: {
    lat: number;
    lng: number;
  };
  reason: string;
  distress_condition?: string;
  ai_confidence?: number;
  risk_score?: number;
  status: 'PENDING' | 'SENT' | 'REJECTED' | 'pending' | 'approved' | 'rejected';
  source?: 'AI_GENERATED' | 'MANUAL';
  admin_notes?: string;
  phone_number?: string;
  age?: number;
}

interface AIClaim {
  id: number;
  claim_id: string;
  worker_id: string;
  worker_name: string;
  full_name: string;
  timestamp: string;
  location: {
    lat: number;
    lng: number;
  };
  reason: string;
  distress_condition: string;
  ai_confidence: number;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes?: string;
  phone_number?: string;
  age?: number;
  source: 'AI_GENERATED' | 'MANUAL';
}

interface ClaimsStats {
  total_claims: number;
  pending: number;
  approved: number;
  rejected: number;
  conditions?: Record<string, number>;
  approval_rate?: number;
}

interface ClaimsResponse {
  status: string;
  claims: BackendAIClaim[];
  total?: number;
  pending_count?: number;
}

interface StatsResponse {
  status: string;
  total_claims?: number;
  pending?: number;
  pending_count?: number;
  approved?: number;
  rejected?: number;
  conditions?: Record<string, number>;
  approval_rate?: number;
}

// Helper: Convert backend status/source to UI format
const normalizeStatus = (backendStatus: string): 'pending' | 'approved' | 'rejected' => {
  const upper = backendStatus.toUpperCase();
  if (upper === 'PENDING') return 'pending';
  if (upper === 'SENT') return 'approved';
  if (upper === 'REJECTED') return 'rejected';
  return 'pending';
};

// Helper: Convert backend claim to UI format
const transformClaim = (backendClaim: BackendAIClaim): AIClaim => {
  return {
    id: backendClaim.id || 0,
    claim_id: backendClaim.claim_id,
    worker_id: backendClaim.worker_id,
    worker_name: backendClaim.worker_name || backendClaim.full_name || 'Unknown Worker',
    full_name: backendClaim.full_name || backendClaim.worker_name || 'Unknown Worker',
    timestamp: backendClaim.timestamp || backendClaim.created_at || new Date().toISOString(),
    location: backendClaim.location || {
      lat: backendClaim.location_lat || 0,
      lng: backendClaim.location_lng || 0
    },
    reason: backendClaim.reason,
    distress_condition: backendClaim.distress_condition || 'HIGH_RISK_DETECTED',
    ai_confidence: backendClaim.ai_confidence || backendClaim.risk_score || 0,
    status: normalizeStatus(backendClaim.status),
    admin_notes: backendClaim.admin_notes,
    phone_number: backendClaim.phone_number,
    age: backendClaim.age,
    source: backendClaim.source || 'AI_GENERATED'
  };
};

export default function AIClaimsPanel() {
  const [claims, setClaims] = useState<AIClaim[]>([]);
  const [rawResponse, setRawResponse] = useState<any>(null);
  const [stats, setStats] = useState<ClaimsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedClaim, setSelectedClaim] = useState<AIClaim | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [actionLoading, setActionLoading] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [debugMode, setDebugMode] = useState(true);

  const token = localStorage.getItem('token');
  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';

  useEffect(() => {
    loadClaims();
    loadStats();
  }, [filterStatus]);

  const loadClaims = async () => {
    try {
      setLoading(true);
      console.log(`[AIClaimsPanel] Loading claims with filter: ${filterStatus}`);
      
      const endpoint = `${apiBaseUrl}/api/admin/claims`;
      console.log(`[AIClaimsPanel] Fetching from: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`[AIClaimsPanel] Response status: ${response.status}`);
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }
      
      const data = (await response.json()) as ClaimsResponse;
      console.log('[AIClaimsPanel] Claims Response:', data);
      setRawResponse(data);
      
      let backendClaims = data.claims || [];
      console.log(`[AIClaimsPanel] Received ${backendClaims.length} claims from backend`);
      
      // Filter for AI_GENERATED claims only
      let aiClaims = backendClaims.filter(c => {
        const source = c.source || 'AI_GENERATED';
        return source === 'AI_GENERATED';
      });
      console.log(`[AIClaimsPanel] After source filter: ${aiClaims.length} AI-generated claims`);
      
      // Transform backend claims to UI format
      let transformedClaims = aiClaims.map(transformClaim);
      console.log('[AIClaimsPanel] Transformed claims:', transformedClaims);
      
      // Apply status filter
      if (filterStatus === 'pending') {
        transformedClaims = transformedClaims.filter(c => c.status === 'pending');
        console.log(`[AIClaimsPanel] After pending filter: ${transformedClaims.length} claims`);
      } else if (filterStatus === 'approved') {
        transformedClaims = transformedClaims.filter(c => c.status === 'approved');
        console.log(`[AIClaimsPanel] After approved filter: ${transformedClaims.length} claims`);
      } else if (filterStatus === 'rejected') {
        transformedClaims = transformedClaims.filter(c => c.status === 'rejected');
        console.log(`[AIClaimsPanel] After rejected filter: ${transformedClaims.length} claims`);
      }
      
      console.log(`[AIClaimsPanel] Final claims to display: ${transformedClaims.length}`);
      setClaims(transformedClaims);
    } catch (error) {
      console.error('[AIClaimsPanel] Error loading claims:', error);
      setClaims([]);
      setRawResponse({ error: String(error) });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const endpoint = `${apiBaseUrl}/api/admin/claims/pending`;
      console.log(`[AIClaimsPanel] Loading stats from: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to load stats');
      
      const data = (await response.json()) as StatsResponse;
      console.log('[AIClaimsPanel] Stats Response:', data);
      
      setStats({
        total_claims: (data.total_claims || 0),
        pending: (data.pending_count || data.pending || 0),
        approved: (data.approved || 0),
        rejected: (data.rejected || 0),
        conditions: data.conditions,
        approval_rate: data.approval_rate
      });
    } catch (error) {
      console.error('[AIClaimsPanel] Error loading stats:', error);
    }
  };

  const handleApproveClaim = async (claimId: string) => {
    try {
      setActionLoading(true);
      const endpoint = `${apiBaseUrl}/api/claims/${claimId}/status`;
      console.log(`[AIClaimsPanel] Approving claim at: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          status: 'SENT',
          admin_notes: adminNotes 
        })
      });
      
      if (!response.ok) throw new Error('Failed to approve claim');
      
      console.log('[AIClaimsPanel] Claim approved successfully');
      alert('Claim approved successfully');
      setAdminNotes('');
      setSelectedClaim(null);
      loadClaims();
      loadStats();
    } catch (error) {
      console.error('[AIClaimsPanel] Error approving claim:', error);
      alert('Failed to approve claim');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectClaim = async (claimId: string) => {
    try {
      setActionLoading(true);
      const endpoint = `${apiBaseUrl}/api/claims/${claimId}/status`;
      console.log(`[AIClaimsPanel] Rejecting claim at: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          status: 'REJECTED',
          admin_notes: adminNotes || 'Rejected by admin' 
        })
      });
      
      if (!response.ok) throw new Error('Failed to reject claim');
      
      console.log('[AIClaimsPanel] Claim rejected successfully');
      alert('Claim rejected');
      setAdminNotes('');
      setSelectedClaim(null);
      loadClaims();
      loadStats();
    } catch (error) {
      console.error('[AIClaimsPanel] Error rejecting claim:', error);
      alert('Failed to reject claim');
    } finally {
      setActionLoading(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 70) return 'text-red-600';
    if (confidence >= 40) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
            <Clock className="w-4 h-4 mr-2" /> Pending
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-4 h-4 mr-2" /> Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
            <XCircle className="w-4 h-4 mr-2" /> Rejected
          </span>
        );
      default:
        return status;
    }
  };

  return (
    <div className="w-full bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
            <Zap className="w-8 h-8 text-blue-600" />
            AI Autonomous Claims
          </h2>
          <button
            onClick={() => setDebugMode(!debugMode)}
            className="px-3 py-1 text-xs bg-slate-600 text-white rounded hover:bg-slate-700"
          >
            {debugMode ? 'Hide' : 'Show'} Debug
          </button>
        </div>
        <p className="text-slate-600">
          AI-generated insurance claims from worker distress detection system
        </p>
        {debugMode && rawResponse && (
          <div className="mt-3 p-3 bg-yellow-100 border border-yellow-400 rounded text-xs overflow-auto max-h-40">
            <strong>API Response Debug:</strong>
            <pre>{JSON.stringify(rawResponse, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* Stats Dashboard */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 shadow">
            <div className="text-sm text-slate-600 mb-1">Total Claims</div>
            <div className="text-3xl font-bold text-slate-800">{stats.total_claims}</div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4 shadow">
            <div className="text-sm text-yellow-700 mb-1">Pending Review</div>
            <div className="text-3xl font-bold text-yellow-800">{stats.pending}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 shadow">
            <div className="text-sm text-green-700 mb-1">Approved</div>
            <div className="text-3xl font-bold text-green-800">{stats.approved}</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4 shadow">
            <div className="text-sm text-red-700 mb-1">Rejected</div>
            <div className="text-3xl font-bold text-red-800">{stats.rejected}</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 shadow">
            <div className="text-sm text-blue-700 mb-1">Approval Rate</div>
            <div className="text-3xl font-bold text-blue-800">{stats.approval_rate}%</div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {['all', 'pending', 'approved', 'rejected'].map((filter) => (
          <button
            key={filter}
            onClick={() => setFilterStatus(filter as typeof filterStatus)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterStatus === filter
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-200'
            }`}
          >
            {filter.charAt(0).toUpperCase() + filter.slice(1)}
          </button>
        ))}
      </div>

      {/* Debug: Raw Claims Display */}
      {debugMode && claims.length > 0 && (
        <div className="mb-6 p-3 bg-blue-100 border border-blue-400 rounded text-xs overflow-auto max-h-40">
          <strong>Debug: Transformed Claims ({claims.length}):</strong>
          <pre>{JSON.stringify(claims.map(c => ({
            claim_id: c.claim_id,
            status: c.status,
            source: c.source,
            worker_name: c.worker_name,
            ai_confidence: c.ai_confidence
          })), null, 2)}</pre>
        </div>
      )}

      {/* Claims List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-slate-600">Loading claims...</p>
        </div>
      ) : claims.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg">
          <AlertCircle className="w-12 h-12 mx-auto text-slate-400 mb-2" />
          <p className="text-slate-600 font-semibold mb-2">No claims found</p>
          {debugMode && (
            <div className="text-xs text-slate-500 mt-4">
              <p>Filter: {filterStatus}</p>
              <p>API Base: {apiBaseUrl}</p>
              <p>Token exists: {!!token}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {claims.map((claim) => (
            <div
              key={claim.claim_id}
              className="bg-white rounded-lg p-4 shadow hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedClaim(claim)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="font-bold text-slate-800 text-lg">
                    {claim.full_name || claim.worker_name || 'Unknown Worker'}
                  </div>
                  <div className="text-sm text-slate-500">{claim.claim_id}</div>
                </div>
                {getStatusBadge(claim.status)}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                <div>
                  <div className="text-slate-500">Condition</div>
                  <div className="font-medium text-slate-800 capitalize">
                    {claim.distress_condition}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">AI Confidence</div>
                  <div className={`font-bold ${getConfidenceColor(claim.ai_confidence)}`}>
                    {claim.ai_confidence}%
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Timestamp</div>
                  <div className="text-slate-800">
                    {new Date(claim.timestamp).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Contact</div>
                  <div className="text-slate-800">{claim.phone_number || 'N/A'}</div>
                </div>
              </div>

              <div className="mb-3">
                <div className="text-sm text-slate-500 mb-1">Reason</div>
                <div className="text-slate-800">{claim.reason}</div>
              </div>

              <div className="flex items-center gap-2 text-blue-600 text-sm">
                <MapPin className="w-4 h-4" />
                {claim.location.lat.toFixed(4)}, {claim.location.lng.toFixed(4)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detailed View Modal */}
      {selectedClaim && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-screen overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 border-b">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-2xl font-bold">
                    Claim #{selectedClaim.claim_id}
                  </h3>
                  <p className="text-blue-100 mt-1">{selectedClaim.full_name || 'Unknown'}</p>
                </div>
                <button
                  onClick={() => setSelectedClaim(null)}
                  className="text-2xl font-bold hover:text-blue-200"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <div className="text-sm text-slate-600 font-semibold mb-1">Status</div>
                  {getStatusBadge(selectedClaim.status)}
                </div>
                <div>
                  <div className="text-sm text-slate-600 font-semibold mb-1">AI Confidence</div>
                  <div className={`text-2xl font-bold ${getConfidenceColor(selectedClaim.ai_confidence)}`}>
                    {selectedClaim.ai_confidence}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-600 font-semibold mb-1">Time Generated</div>
                  <div className="text-slate-800">
                    {new Date(selectedClaim.timestamp).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-600 font-semibold mb-1">Age</div>
                  <div className="text-slate-800">{selectedClaim.age || 'N/A'} years</div>
                </div>
              </div>

              <div className="border-t pt-4 mb-4">
                <div className="text-sm text-slate-600 font-semibold mb-2">Distress Condition</div>
                <div className="text-lg font-bold text-slate-800 capitalize mb-3">
                  {selectedClaim.distress_condition}
                </div>

                <div className="text-sm text-slate-600 font-semibold mb-2">Reason</div>
                <p className="text-slate-800 mb-4">{selectedClaim.reason}</p>

                <div className="text-sm text-slate-600 font-semibold mb-2">Location</div>
                <div className="flex items-center gap-2 text-slate-800 mb-4">
                  <MapPin className="w-5 h-5 text-blue-600" />
                  <span>
                    {selectedClaim.location.lat.toFixed(5)}, {selectedClaim.location.lng.toFixed(5)}
                  </span>
                </div>

                {selectedClaim.admin_notes && (
                  <>
                    <div className="text-sm text-slate-600 font-semibold mb-2">Admin Notes</div>
                    <p className="text-slate-800 bg-slate-50 p-3 rounded mb-4">
                      {selectedClaim.admin_notes}
                    </p>
                  </>
                )}
              </div>

              {/* Admin Actions (only for pending) */}
              {selectedClaim.status === 'pending' && (
                <div className="border-t pt-4">
                  <div className="mb-3">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Admin Notes
                    </label>
                    <textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Add decision reason or notes..."
                      className="w-full border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleApproveClaim(selectedClaim.claim_id)}
                      disabled={actionLoading}
                      className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-5 h-5" />
                      Approve Claim
                    </button>
                    <button
                      onClick={() => handleRejectClaim(selectedClaim.claim_id)}
                      disabled={actionLoading}
                      className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <XCircle className="w-5 h-5" />
                      Reject Claim
                    </button>
                  </div>
                </div>
              )}

              {selectedClaim.status !== 'pending' && (
                <div className="border-t pt-4">
                  <button
                    onClick={() => setSelectedClaim(null)}
                    className="w-full bg-slate-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-slate-700"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
