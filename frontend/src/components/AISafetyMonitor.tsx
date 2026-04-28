import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, AlertCircle, TrendingUp, Clock } from 'lucide-react';

interface RiskData {
  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  ai_status: 'SAFE' | 'WARNING' | 'CRITICAL';
  reasons: string[];
  updated_at: string;
}

export default function AISafetyMonitor() {
  const [riskData, setRiskData] = useState<RiskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [emergencyAlert, setEmergencyAlert] = useState(false);

  const fetchRiskData = async () => {
    try {
      const token = localStorage.getItem('token');
      const userStr = localStorage.getItem('user');
      if (!userStr) return;
      
      const user = JSON.parse(userStr);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/worker/${user.id}/risk`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (!response.ok) throw new Error('Failed to fetch risk data');
      
      const data = await response.json();
      if (data.status === 'success') {
        setRiskData(data);
        setEmergencyAlert(data.risk_score > 70);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRiskData();
    const interval = setInterval(fetchRiskData, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 animate-pulse">
        <div className="h-40 bg-gray-800 rounded"></div>
      </div>
    );
  }

  if (!riskData) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <p className="text-gray-400">Unable to load risk data</p>
      </div>
    );
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'HIGH': return 'text-red-500';
      case 'MEDIUM': return 'text-yellow-500';
      default: return 'text-green-500';
    }
  };

  const getRiskBgColor = (level: string) => {
    switch (level) {
      case 'HIGH': return 'bg-red-500/10 border-red-500/30';
      case 'MEDIUM': return 'bg-yellow-500/10 border-yellow-500/30';
      default: return 'bg-green-500/10 border-green-500/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'CRITICAL':
        return <AlertTriangle className="w-6 h-6 text-red-500" />;
      case 'WARNING':
        return <AlertCircle className="w-6 h-6 text-yellow-500" />;
      default:
        return <CheckCircle className="w-6 h-6 text-green-500" />;
    }
  };

  return (
    <div className={`rounded-lg border transition-all duration-300 ${getRiskBgColor(riskData.risk_level)}`}>
      {emergencyAlert && (
        <div className="bg-red-500/20 border-b border-red-500/30 px-6 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div className="text-sm text-red-300 font-medium">
            Emergency detected. AI is initiating insurance claim...
          </div>
        </div>
      )}

      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white tracking-wide uppercase">
            AI Safety Monitor
          </h3>
          <div className="flex items-center gap-2">
            {getStatusIcon(riskData.ai_status)}
            <span className={`text-sm font-medium ${getRiskColor(riskData.risk_level)}`}>
              {riskData.ai_status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800/50 rounded-lg p-4 text-center">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Risk Score</div>
            <div className={`text-3xl font-bold ${getRiskColor(riskData.risk_level)}`}>
              {riskData.risk_score}
              <span className="text-sm text-gray-500 ml-1">/100</span>
            </div>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-4 text-center">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Risk Level</div>
            <div className={`text-2xl font-bold ${getRiskColor(riskData.risk_level)}`}>
              {riskData.risk_level}
            </div>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-4 text-center">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">AI Status</div>
            <div className={`text-2xl font-bold ${getRiskColor(riskData.risk_level)}`}>
              {riskData.ai_status}
            </div>
          </div>
        </div>

        {riskData.reasons && riskData.reasons.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">
              Detected Issues
            </h4>
            <div className="space-y-2">
              {riskData.reasons.map((reason, idx) => (
                <div key={idx} className="flex items-start gap-3 bg-gray-800/30 rounded p-3">
                  <TrendingUp className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-300">{reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {riskData.reasons.length === 0 && (
          <div className="flex items-center gap-3 bg-green-500/10 rounded p-3 border border-green-500/20">
            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span className="text-sm text-green-300">All systems normal. Worker is safe.</span>
          </div>
        )}

        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-700 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          <span>Updated: {new Date(riskData.updated_at).toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}
