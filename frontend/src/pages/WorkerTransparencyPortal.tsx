import React, { useState } from 'react';
import { 
   Activity, ShieldAlert, FileText, Map as MapIcon, MapPin, Cloud, Radio, LogOut, 
  Search, Bell, Download, Sparkles, ChevronRight, User, AlertTriangle, CheckCircle, 
  TrendingUp, IndianRupee, PieChart, Users, AlertCircle, RefreshCw, Clock
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart 
} from 'recharts';

// --- MOCK DATA ---
const mockWorkers = Array.from({ length: 20 }).map((_, i) => ({
  id: `Worker-${1023 + i}`,
  name: `Worker-${1023 + i}`,
  role: i % 2 === 0 ? 'Field Operator' : 'Site Supervisor',
  risk: i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low',
}));

const mockChartData = [
  { date: '1 Oct', score: 45 }, { date: '5 Oct', score: 52 }, { date: '10 Oct', score: 48 },
  { date: '15 Oct', score: 65 }, { date: '20 Oct', score: 82 }, { date: '25 Oct', score: 75 },
  { date: '30 Oct', score: 78 }
];

const mockTrustData = [
  { date: '1 Oct', trust: 70 }, { date: '5 Oct', trust: 65 }, { date: '10 Oct', trust: 68 },
  { date: '15 Oct', trust: 55 }, { date: '20 Oct', trust: 30 }, { date: '25 Oct', trust: 45 },
  { date: '30 Oct', trust: 42 }
];

const mockClaims = [
  { id: 'CLM-99201', amount: '₹12,400', status: 'Rejected', risk: 85, date: '24 Oct 2026, 14:20', reason: 'GPS spoofing detected' },
  { id: 'CLM-99184', amount: '₹8,500', status: 'Under Review', risk: 65, date: '20 Oct 2026, 09:15', reason: 'Velocity anomaly' },
  { id: 'CLM-98022', amount: '₹4,100', status: 'Approved', risk: 12, date: '15 Oct 2026, 11:45', reason: 'Verified via Network' },
  { id: 'CLM-97991', amount: '₹14,000', status: 'Rejected', risk: 92, date: '10 Oct 2026, 18:30', reason: 'Simultaneous cluster login' }
];

const mockConnections = [
  { id: 'Worker-1088', risk: 'high', strength: 88 },
  { id: 'Worker-2041', risk: 'medium', strength: 65 },
  { id: 'Worker-0992', risk: 'low', strength: 24 }
];

// --- COMPONENTS ---

const Sidebar = () => (
  <aside className="fixed top-0 left-0 h-screen w-64 bg-[#0B1220] border-r border-[#1E293B] flex flex-col z-50">
    <div className="p-6 border-b border-[#1E293B] flex items-center space-x-3">
      <ShieldAlert className="text-blue-500 w-8 h-8" />
      <h1 className="text-xl font-bold text-white tracking-wider uppercase">CopGuard<span className="text-blue-500">AI</span></h1>
    </div>
    
    <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
      {[
        { name: 'Live SOC', icon: Activity },
        { name: 'Claims', icon: FileText },
        { name: 'Syndicate Map', icon: MapIcon },
        { name: 'Live Map', icon: MapPin },
        { name: 'Weather Intel', icon: Cloud },
        { name: 'Network Intel', icon: Radio },
      ].map(item => (
        <a key={item.name} href="#" className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-[#1E293B] transition-colors">
          <item.icon className="w-5 h-5" />
          <span className="font-medium text-sm">{item.name}</span>
        </a>
      ))}

      {/* Active Expanded Menu */}
      <div className="mt-2 text-white">
        <div className="flex items-center space-x-3 px-4 py-3 bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg">
          <FileText className="w-5 h-5 text-blue-400" />
          <span className="font-medium text-sm text-blue-400">Worker Reports</span>
        </div>
        <div className="ml-12 mt-1 space-y-1 border-l border-[#1E293B] pl-4 py-2">
          <a href="#" className="block py-2 text-sm text-gray-400 hover:text-white">All Workers</a>
          <a href="#" className="block py-2 text-sm text-blue-400 font-medium">Transparency Portal</a>
        </div>
      </div>
    </nav>

    <div className="p-4 border-t border-[#1E293B]">
      <button className="flex items-center justify-center space-x-2 w-full px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors border border-red-500/20">
        <LogOut className="w-4 h-4" />
        <span className="font-medium text-sm">Logout</span>
      </button>
    </div>
  </aside>
);

const Header = () => (
  <header className="h-20 bg-[#0B1220]/80 backdrop-blur-md border-b border-[#1E293B] flex items-center justify-between px-8 sticky top-0 z-40">
    <div>
      <h2 className="text-2xl font-bold text-white">Worker Transparency Portal</h2>
      <div className="flex items-center text-xs text-gray-400 mt-1 font-medium">
        <span>Worker Reports</span>
        <ChevronRight className="w-3 h-3 mx-1" />
        <span className="text-blue-400">Worker Profile</span>
      </div>
    </div>

    <div className="flex items-center space-x-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input 
          type="text" 
          placeholder="Search workers, claims..." 
          className="bg-[#020617] border border-[#1E293B] text-white text-sm rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-blue-500 w-64 transition-colors focus:ring-1 focus:ring-blue-500"
        />
      </div>
      
      <button className="relative p-2 text-gray-400 hover:text-white transition-colors">
        <Bell className="w-5 h-5" />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-[#0B1220]"></span>
      </button>

      <div className="flex items-center space-x-3 border-l border-[#1E293B] pl-6">
        <div className="text-right hidden md:block">
          <p className="text-sm font-bold text-white">Analyst - Level 3</p>
          <p className="text-xs text-gray-400">Security Ops</p>
        </div>
        <div className="w-9 h-9 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center text-blue-400 font-bold">
          A3
        </div>
      </div>
      
      <div className="flex items-center space-x-3 border-l border-[#1E293B] pl-6">
        <button className="flex items-center space-x-2 px-4 py-2 border border-[#1E293B] rounded-lg text-sm text-gray-300 hover:bg-[#1E293B] transition-colors">
          <Download className="w-4 h-4" />
          <span>Export Report</span>
        </button>
        <button className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-sm font-bold shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all">
          <Sparkles className="w-4 h-4" />
          <span>Generate AI Summary</span>
        </button>
      </div>
    </div>
  </header>
);

const WorkerList = ({ selected, setSelected }: any) => (
  <div className="w-80 bg-[#0B1220]/50 border-r border-[#1E293B] flex flex-col h-[calc(100vh-5rem)]">
    <div className="p-5 border-b border-[#1E293B]">
      <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest mb-4">All Workers (1248)</h3>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input 
          type="text" 
          placeholder="Filter by ID or Name" 
          className="w-full bg-[#020617] border border-[#1E293B] text-white text-sm rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>
    </div>
    
    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
      {mockWorkers.map((worker) => (
        <button 
          key={worker.id}
          onClick={() => setSelected(worker.id)}
          className={`w-full flex items-center p-3 rounded-xl transition-all ${selected === worker.id ? 'bg-blue-900/20 border border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'border border-transparent hover:bg-[#1E293B]'}`}
        >
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700">
              <User className="w-5 h-5 text-gray-400" />
            </div>
            <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0B1220] ${worker.risk === 'high' ? 'bg-red-500' : worker.risk === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
          </div>
          <div className="ml-3 text-left">
            <p className={`text-sm font-bold ${selected === worker.id ? 'text-blue-400' : 'text-gray-200'}`}>{worker.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{worker.role}</p>
          </div>
        </button>
      ))}
    </div>
  </div>
);

export default function WorkerTransparencyPortal() {
  const [selectedWorker, setSelectedWorker] = useState(mockWorkers[0].id);

  console.log("WorkerTransparencyPortal mounted");

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B1220] to-[#020617] flex font-sans text-gray-100 overflow-hidden">
      <div className="absolute top-0 right-0 z-[100] bg-blue-600 px-4 py-2 font-bold shadow-lg">
         <h1 style={{ color: "white" }}>WORKER PORTAL LOADED</h1>
      </div>
      <Sidebar />
      
      <main className="flex-1 ml-64 flex flex-col h-screen overflow-hidden">
        <Header />
        
        <div className="flex flex-1 overflow-hidden">
          <WorkerList selected={selectedWorker} setSelected={setSelectedWorker} />
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
            
            {/* 1. WORKER PROFILE HEADER */}
            <div className="bg-[#0B1220]/80 backdrop-blur-md border border-[#1E293B] rounded-2xl p-6 mb-6 shadow-xl flex items-center justify-between">
              <div className="flex items-center space-x-6">
                <div className="relative">
                   <div className="w-20 h-20 rounded-full bg-gray-800 border-2 border-red-500 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                     <User className="w-10 h-10 text-gray-400" />
                   </div>
                   <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold uppercase rounded-full whitespace-nowrap">
                      High Risk
                   </div>
                </div>
                <div>
                  <h1 className="text-2xl font-extrabold text-white">{selectedWorker}</h1>
                  <p className="text-sm text-gray-400 mt-1 flex items-center">
                     Field Operator <span className="mx-2">•</span> ID: {selectedWorker.split('-')[1]} <span className="mx-2">•</span> <MapPin className="w-3 h-3 mx-1" /> Delhi Zone 4
                  </p>
                </div>
              </div>
              <div className="text-right">
                 <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Joined</p>
                 <p className="text-lg text-gray-300">14 Aug 2025</p>
              </div>
            </div>

            {/* 2. KPI CARDS */}
            <div className="grid grid-cols-4 gap-6 mb-6">
              {[
                { label: 'Risk Score', val: '78/100', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]', trend: '+12% this week' },
                { label: 'Total Claims', val: '24', icon: FileText, color: 'text-blue-500', bg: 'bg-[#0B1220]/80 border-[#1E293B]', trend: null },
                { label: 'Fraud Flags', val: '6', icon: ShieldAlert, color: 'text-orange-500', bg: 'bg-[#0B1220]/80 border-[#1E293B]', trend: null },
                { label: 'Active Since', val: '1.3 yrs', icon: Clock, color: 'text-green-500', bg: 'bg-[#0B1220]/80 border-[#1E293B]', trend: null },
              ].map((kpi, i) => (
                <div key={i} className={`rounded-2xl p-5 border backdrop-blur-md ${kpi.bg}`}>
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{kpi.label}</p>
                    <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                  </div>
                  <p className="text-3xl font-light text-white">{kpi.val}</p>
                  {kpi.trend && <p className="text-xs text-red-400 mt-2 font-medium flex items-center"><TrendingUp className="w-3 h-3 mr-1" /> {kpi.trend}</p>}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-6 mb-6">
              
              {/* 3. FINANCIAL SUMMARY */}
              <div className="col-span-1 border border-[#1E293B] bg-[#0B1220]/80 backdrop-blur-md rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                <div>
                    <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest mb-6">Financial Summary</h3>
                    <div className="space-y-5">
                      <div className="flex justify-between items-center bg-[#020617] p-3 rounded-lg border border-[#1E293B]">
                        <div className="flex items-center text-green-500"><IndianRupee className="w-4 h-4 mr-2" /> <span className="text-sm font-medium text-gray-300">Total Paid</span></div>
                        <span className="font-mono text-green-400 font-bold">₹1,20,000</span>
                      </div>
                      <div className="flex justify-between items-center bg-[#020617] p-3 rounded-lg border border-[#1E293B]">
                        <div className="flex items-center text-red-500"><AlertCircle className="w-4 h-4 mr-2" /> <span className="text-sm font-medium text-gray-300">Rejected</span></div>
                        <span className="font-mono text-red-400 font-bold">₹45,000</span>
                      </div>
                      <div className="flex justify-between items-center bg-[#020617] p-3 rounded-lg border border-[#1E293B]">
                        <div className="flex items-center text-orange-500"><ShieldAlert className="w-4 h-4 mr-2" /> <span className="text-sm font-medium text-gray-300">Fraudulent</span></div>
                        <span className="font-mono text-orange-400 font-bold">₹18,000</span>
                      </div>
                    </div>
                </div>
                <div className="mt-6 flex items-center justify-between border-t border-[#1E293B] pt-4">
                   <div className="flex items-center space-x-2 text-gray-400"><PieChart className="w-4 h-4" /> <span className="text-sm">Success Rate</span></div>
                   <span className="text-lg font-bold text-white">58%</span>
                </div>
              </div>

              {/* TIMELINES */}
              <div className="col-span-2 grid grid-cols-2 gap-6">
                
                {/* 4. RISK SCORE TIMELINE */}
                <div className="border border-[#1E293B] bg-[#0B1220]/80 backdrop-blur-md rounded-2xl p-6 shadow-xl flex flex-col">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest flex items-center"><TrendingUp className="w-4 h-4 mr-2 text-red-500" /> Risk Score Timeline</h3>
                    <select className="bg-[#020617] border border-[#1E293B] text-xs text-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-red-500">
                      <option>Last 30 Days</option>
                      <option>Last 3 Months</option>
                    </select>
                  </div>
                  <div className="flex-1 min-h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={mockChartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                        <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#0B1220', borderColor: '#1E293B', color: '#fff', borderRadius: '8px' }} itemStyle={{ color: '#ef4444' }} />
                        <Area type="monotone" dataKey="score" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 4.5. TRUST SCORE TIMELINE */}
                <div className="border border-[#1E293B] bg-[#0B1220]/80 backdrop-blur-md rounded-2xl p-6 shadow-xl flex flex-col">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest flex items-center">
                      <TrendingUp className="w-4 h-4 mr-2 text-green-500" /> 
                      Trust Score Timeline
                      <span className="ml-2 text-[10px] text-red-500 font-bold bg-red-500/10 px-1.5 py-0.5 rounded">↓ Declining</span>
                    </h3>
                    <select className="bg-[#020617] border border-[#1E293B] text-xs text-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-green-500">
                      <option>Last 30 Days</option>
                      <option>Last 3 Months</option>
                    </select>
                  </div>
                  <div className="flex-1 min-h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={mockTrustData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorTrust" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                        <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#0B1220', borderColor: '#1E293B', color: '#fff', borderRadius: '8px' }} itemStyle={{ color: '#22c55e' }} formatter={(value: any) => [`${value}`, 'Trust Score']} />
                        <Area type="monotone" dataKey="trust" stroke="#22c55e" strokeWidth={3} fillOpacity={1} fill="url(#colorTrust)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>
            </div>

            {/* 5. AI INSIGHT PANEL */}
            <div className="border border-blue-900/50 bg-blue-900/10 backdrop-blur-md rounded-2xl p-6 mb-6 shadow-[0_0_20px_rgba(59,130,246,0.05)]">
               <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-4 flex items-center">
                 <Sparkles className="w-4 h-4 mr-2" /> AI Insight (Powered by Gemini)
               </h3>
               <div className="text-sm text-gray-300 leading-relaxed space-y-3">
                 <p>This worker exhibits a sharply increasing risk pattern over the last 15 days, converging from a baseline of 48 to an acute high of 82. The escalation explicitly correlates with repeated consecutive rejected claims filed inside known clustered latency hubs.</p>
                 <p>Furthermore, <strong>high-value attempts (₹14,000+)</strong> map directly to periods of simulated network disruption alongside strong connections to known high-risk operators within the Syndicate Graph.</p>
                 <p className="text-red-400 font-medium">Recommendation: Immediate suspension of automatic claim approval until manual field audit completes.</p>
               </div>
               <div className="flex justify-between items-center mt-5 pt-4 border-t border-blue-900/30">
                 <p className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center"><Clock className="w-3 h-3 mr-1" /> Generated Today, 09:42 AM</p>
                 <button className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center transition-colors">
                   <RefreshCw className="w-3 h-3 mr-1" /> Regenerate Insight
                 </button>
               </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              
              {/* 6. CLAIM HISTORY TABLE */}
              <div className="col-span-2 border border-[#1E293B] bg-[#0B1220]/80 backdrop-blur-md rounded-2xl shadow-xl overflow-hidden flex flex-col">
                <div className="p-5 border-b border-[#1E293B] flex justify-between items-center bg-[#0B1220]">
                  <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest">Recent Claims History</h3>
                  <button className="text-xs font-medium text-blue-400 hover:text-blue-300">View All Claims →</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-gray-400">
                    <thead className="text-[10px] uppercase bg-[#020617] text-gray-500 border-b border-[#1E293B]">
                      <tr>
                        <th className="px-5 py-3 font-bold">Claim ID</th>
                        <th className="px-5 py-3 font-bold">Amount</th>
                        <th className="px-5 py-3 font-bold">Status</th>
                        <th className="px-5 py-3 font-bold">Risk</th>
                        <th className="px-5 py-3 font-bold">Date & Time</th>
                        <th className="px-5 py-3 font-bold">Reason / Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B]/50">
                      {mockClaims.map((claim, idx) => (
                        <tr key={claim.id} className="hover:bg-[#1E293B]/30 transition-colors">
                          <td className="px-5 py-4 font-mono text-gray-200">{claim.id}</td>
                          <td className="px-5 py-4 text-white font-medium">{claim.amount}</td>
                          <td className="px-5 py-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${
                              claim.status === 'Approved' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                              claim.status === 'Rejected' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                              'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                            }`}>
                              {claim.status}
                            </span>
                          </td>
                          <td className={`px-5 py-4 font-bold ${claim.risk > 70 ? 'text-red-400' : 'text-gray-400'}`}>{claim.risk}</td>
                          <td className="px-5 py-4 text-xs">{claim.date}</td>
                          <td className="px-5 py-4 text-xs">{claim.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 border-t border-[#1E293B] bg-[#0B1220] flex items-center justify-between text-xs text-gray-500">
                  <span>Showing 1 to 4 of 24 records</span>
                  <div className="flex space-x-1">
                    <button className="px-2 py-1 bg-[#1E293B] rounded hover:text-white transition-colors">Prev</button>
                    <button className="px-2 py-1 bg-blue-600 text-white rounded">1</button>
                    <button className="px-2 py-1 bg-[#1E293B] rounded hover:text-white transition-colors">2</button>
                    <button className="px-2 py-1 bg-[#1E293B] rounded hover:text-white transition-colors">3</button>
                    <button className="px-2 py-1 bg-[#1E293B] rounded hover:text-white transition-colors">Next</button>
                  </div>
                </div>
              </div>

              {/* 7. CONNECTIONS PANEL */}
              <div className="col-span-1 border border-[#1E293B] bg-[#0B1220]/80 backdrop-blur-md rounded-2xl shadow-xl flex flex-col">
                <div className="p-5 border-b border-[#1E293B] flex justify-between items-center bg-[#0B1220]">
                  <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest flex items-center"><Users className="w-4 h-4 mr-2" /> Connections</h3>
                </div>
                <div className="p-5 flex-1 space-y-4">
                  {mockConnections.map(conn => (
                    <div key={conn.id} className="bg-[#020617] border border-[#1E293B] rounded-lg p-3 hover:border-blue-500/50 transition-colors cursor-pointer group">
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700 group-hover:border-blue-500"><User className="w-3 h-3 text-gray-400" /></div>
                          <span className="text-sm font-bold text-gray-200">{conn.id}</span>
                        </div>
                        <span className={`text-[10px] font-bold uppercase ${conn.risk === 'high' ? 'text-red-400' : conn.risk === 'medium' ? 'text-yellow-400' : 'text-green-400'}`}>
                          {conn.risk} Risk
                        </span>
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] text-gray-500 uppercase font-bold mb-1">
                          <span>Connection Strength</span>
                          <span>{conn.strength}%</span>
                        </div>
                        <div className="w-full bg-[#1E293B] h-1.5 rounded-full overflow-hidden">
                          <div className={`h-full ${conn.strength > 80 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${conn.strength}%` }}></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-4 border-t border-[#1E293B] bg-[#0B1220]">
                   <button className="w-full py-2 bg-[#1E293B] hover:bg-gray-800 text-gray-300 text-xs font-bold uppercase tracking-widest rounded transition-colors">
                     View All Connections
                   </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>
      
      {/* Global overrides for dark theme scrollbars */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0B1220; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1E293B; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}</style>
    </div>
  );
}
