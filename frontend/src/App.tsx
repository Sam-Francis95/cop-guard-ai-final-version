import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { Activity, ShieldAlert, FileText, Map, MapPin, Cloud, Radio, LogOut, User, ClipboardList, Zap } from 'lucide-react';
import { useEffect } from 'react';

import Dashboard from './pages/Dashboard';
import ClaimDetail from './pages/ClaimDetail';
import WorkerTransparencyPortal from './pages/WorkerTransparencyPortal';
import SyndicateMap from './pages/SyndicateMap';
import LiveMap from './pages/LiveMap';
import WeatherMap from './pages/WeatherMap';
import NetworkMap from './pages/NetworkMap';
import AdminAIClaimsPanel from './pages/AdminAIClaimsPanel';
import WorkerQRClaims from './pages/WorkerQRClaims';

import Landing from './pages/Landing';
import AdminLogin from './pages/AdminLogin';
import WorkerLogin from './pages/WorkerLogin';
import WorkerRegister from './pages/WorkerRegister';
import LocationInterceptor from './pages/LocationInterceptor';
import WorkerDashboard from './pages/WorkerDashboard';
import WorkerAIAssistant from './pages/WorkerAIAssistant';
import ProtectedRoute from './components/ProtectedRoute';

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  const locationGranted = localStorage.getItem('location_granted') === 'true';

  // Real-time GPS tracking with watchPosition
  useEffect(() => {
    if (token && locationGranted) {
      if (!navigator.geolocation) return;

      const watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/auth/update-location`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ lat: lat, lng: lng })
            });
          } catch (e) {
            console.error("Location sync failed");
          }
        },
        (error) => console.error(error),
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 5000
        }
      );

      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [token, locationGranted]);

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  // Do not wrap layout sidebar around unauthenticated or standalone pages
  const isStandalonePage = ['/', '/login/admin', '/login/worker', '/register', '/location-prompt'].includes(location.pathname) || location.pathname.startsWith('/transparency');
  if (isStandalonePage) {
    return <main className="min-h-screen bg-gray-950">{children}</main>;
  }

  const adminNavLinks = [
    { path: '/dashboard', label: 'Live SOC', icon: Activity },
    { path: '/admin-claims', label: 'Claims', icon: ClipboardList },
    { path: '/syndicate', label: 'Syndicate Map', icon: Map },
    { path: '/map', label: 'Live Map', icon: MapPin },
    { path: '/weather-map', label: 'Weather Intel', icon: Cloud },
    { path: '/network-map', label: 'Network Intel', icon: Radio },
    { path: '/transparency', label: 'Worker Reports', icon: FileText },
  ];

  const workerNavLinks = [
    { path: '/worker-dashboard', label: 'My Dashboard', icon: User },
    { path: '/worker-ai', label: 'AI Assistant', icon: Zap },
    { path: '/worker-qr-claims', label: 'QR Claims', icon: Activity },
  ];

  const navLinks = role === 'admin' ? adminNavLinks : workerNavLinks;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans flex antialiased">
      <aside className="hidden md:flex w-64 bg-gray-900 border-r border-gray-800 flex-col justify-between flex-shrink-0">
        <div>
          <div className="p-6 border-b border-gray-800 flex items-center space-x-3">
            <ShieldAlert className="text-blue-500 w-8 h-8" />
            <h1 className="text-xl font-bold tracking-wider uppercase">CopGuard<span className="text-blue-500">AI</span></h1>
          </div>
          <nav className="p-4 space-y-2">
            {navLinks.map((link) => {
              const active = location.pathname === link.path || location.pathname.startsWith(link.path + '/');
              const Icon = link.icon;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${active ? 'bg-blue-600/10 border-l-4 border-blue-500 text-blue-400' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors w-full text-red-500 hover:bg-red-500/10 font-medium"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col pt-0 h-screen overflow-y-auto w-full">
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/login/admin" element={<AdminLogin />} />
          <Route path="/login/worker" element={<WorkerLogin />} />
          <Route path="/register" element={<WorkerRegister />} />

          {/* Location Interceptor Loop */}
          <Route path="/location-prompt" element={<LocationInterceptor />} />

          {/* Protected Routes - ADMIN */}
          <Route path="/dashboard" element={<ProtectedRoute roleRequired="admin"><Dashboard /></ProtectedRoute>} />
          <Route path="/admin-claims" element={<ProtectedRoute roleRequired="admin"><div className="p-8"><AdminAIClaimsPanel /></div></ProtectedRoute>} />
          <Route path="/claim/:id" element={<ProtectedRoute roleRequired="admin"><ClaimDetail /></ProtectedRoute>} />
          <Route path="/transparency" element={<ProtectedRoute roleRequired="admin"><WorkerTransparencyPortal /></ProtectedRoute>} />
          <Route path="/transparency/:id" element={<ProtectedRoute roleRequired="admin"><WorkerTransparencyPortal /></ProtectedRoute>} />
          <Route path="/syndicate" element={<ProtectedRoute roleRequired="admin"><SyndicateMap /></ProtectedRoute>} />
          <Route path="/map" element={<ProtectedRoute roleRequired="admin"><LiveMap /></ProtectedRoute>} />
          <Route path="/weather-map" element={<ProtectedRoute roleRequired="admin"><WeatherMap /></ProtectedRoute>} />
          <Route path="/network-map" element={<ProtectedRoute roleRequired="admin"><NetworkMap /></ProtectedRoute>} />

          {/* Protected Routes - WORKER */}
          <Route path="/worker-dashboard" element={<ProtectedRoute roleRequired="worker"><WorkerDashboard /></ProtectedRoute>} />
          <Route path="/worker-ai" element={<ProtectedRoute roleRequired="worker"><WorkerAIAssistant /></ProtectedRoute>} />
          <Route path="/worker-qr-claims" element={<ProtectedRoute roleRequired="worker"><div className="px-8"><WorkerQRClaims /></div></ProtectedRoute>} />
        </Routes>
      </Layout>
    </Router>
  );
}
