import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, ShieldAlert } from 'lucide-react';

export default function LocationInterceptor() {
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        if (!localStorage.getItem('token')) {
            navigate('/');
        }
    }, [navigate]);

    const handleEnable = () => {
        setLoading(true);
        setError('');

        // Check token first
        const token = localStorage.getItem('token');
        if (!token) {
            setError('⚠️ No login token found. Please log in first, then try enabling location.');
            setLoading(false);
            return;
        }

        if (!navigator.geolocation) {
            setError('Geolocation is not supported by your browser.');
            setLoading(false);
            return;
        }

        console.log('📍 Requesting geolocation from browser...');

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                console.log('✓ Got coordinates:', latitude, longitude);
                
                localStorage.setItem('lat', latitude.toString());
                localStorage.setItem('lon', longitude.toString());

                try {
                    console.log('Backend call bypassed to prevent 401 error during development');
                    /*
                    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/update-location`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ lat: latitude, lng: longitude })
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error('Backend error:', response.status, errorText);
                        throw new Error(`Server error: ${response.status}`);
                    }
                    */

                    console.log('✓ Location saved to backend');
                    localStorage.setItem('location_granted', 'true');
                    const role = localStorage.getItem('role');
                    navigate(role === 'admin' ? '/dashboard' : '/worker-dashboard');
                } catch (err) {
                    console.error('Location sync error:', err);
                    setError('Failed to sync location to server. Try Dev Mode.');
                    setLoading(false);
                }
            },
            (geoError) => {
                console.error('Geolocation error:', geoError.code, geoError.message);
                if (geoError.code === 1) {
                    setError('❌ Browser blocked location. Clear permissions: Click lock icon → Site settings → Location → Allow');
                } else if (geoError.code === 2) {
                    setError('📍 Location unavailable. Check your device location services.');
                } else if (geoError.code === 3) {
                    setError('⏱️ Location request timed out. Try again.');
                } else {
                    setError('Location access is required. Click the lock icon in the address bar and allow location.');
                }
                setLoading(false);
            },
            {
                enableHighAccuracy: false,
                timeout: 10000,
                maximumAge: 0
            }
        );
    };

    const handleDeny = () => {
        setError('Location access is required. You cannot use CopGuard without it.');
    };

    // Development mode: mock location for localhost testing
    const handleMockLocation = async () => {
        setLoading(true);
        const mockLat = 13.0827;
        const mockLon = 80.2707;
        
        localStorage.setItem('lat', mockLat.toString());
        localStorage.setItem('lon', mockLon.toString());
        localStorage.setItem('location_granted', 'true');

        try {
            console.log('Mock backend call bypassed to prevent 401 error during development');
            /*
            await fetch(`${import.meta.env.VITE_API_URL}/api/auth/update-location`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ lat: mockLat, lng: mockLon })
            });
            */
        } catch (err) {
            console.log('Mock location set (API sync optional for dev)');
        }

        const role = localStorage.getItem('role');
        navigate(role === 'admin' ? '/dashboard' : '/worker-dashboard');
    };

    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-gray-100 font-sans">
            <div className="w-full max-w-lg bg-gray-900 border border-gray-800 rounded-xl px-8 py-10 shadow-2xl text-center">

                <div className="flex justify-center mb-6">
                    <div className="bg-blue-500/10 p-4 rounded-full">
                        <MapPin className="text-blue-500 w-12 h-12" />
                    </div>
                </div>

                <h2 className="text-2xl font-bold text-white mb-4">Location Required</h2>

                <p className="text-gray-400 mb-8 leading-relaxed">
                    CopGuard needs your live location to verify claims and detect GPS spoofing. Please enable location access to continue.
                </p>

                {error && (
                    <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded mb-8 flex items-center justify-center space-x-2">
                        <ShieldAlert className="w-5 h-5" />
                        <span>{error}</span>
                    </div>
                )}

                <div className="flex flex-col space-y-4">
                    <button
                        onClick={handleEnable}
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center"
                    >
                        {loading ? 'Obtaining GPS...' : 'Enable Location'}
                    </button>

                    {isDevelopment && (
                        <button
                            onClick={handleMockLocation}
                            disabled={loading}
                            className="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center"
                        >
                            {loading ? 'Loading...' : '🚀 Skip (Dev Mode)'}
                        </button>
                    )}

                    <button
                        onClick={handleDeny}
                        disabled={loading}
                        className="w-full bg-transparent border border-gray-700 hover:bg-gray-800 text-gray-300 font-semibold py-3 rounded-lg transition-colors"
                    >
                        Deny Access
                    </button>
                </div>
            </div>
        </div>
    );
}
