import { useState } from 'react';
import { ShieldAlert, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AdminLogin() {
    const [email, setEmail] = useState('admin@copguard.com');
    const [password, setPassword] = useState('Admin@123');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();

            if (data.status === 'success') {
                localStorage.setItem('token', data.token);
                localStorage.setItem('role', data.role);
                navigate('/location-prompt');
            } else {
                setError(data.message || 'Login failed');
            }
        } catch (err) {
            setError('Network error approaching server.');
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-gray-100 font-sans">
            <div className="flex items-center space-x-3 mb-8">
                <ShieldAlert className="text-blue-500 w-10 h-10" />
                <h1 className="text-3xl font-bold tracking-wider uppercase">CopGuard<span className="text-blue-500">AI</span></h1>
            </div>

            <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-xl px-8 py-10 shadow-2xl">
                <h2 className="text-2xl font-bold text-white mb-6 text-center">Admin Access — CopGuard SOC</h2>

                {error && <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded mb-6 text-sm">{error}</div>}

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Email address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-3.5 text-gray-500 hover:text-gray-300"
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors mt-4">
                        Secure Login
                    </button>
                </form>
            </div>
        </div>
    );
}
