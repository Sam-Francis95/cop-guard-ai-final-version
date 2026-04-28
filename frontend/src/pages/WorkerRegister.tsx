import { useState } from 'react';
import { ShieldAlert, Eye, EyeOff } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';

export default function WorkerRegister() {
    const [fullName, setFullName] = useState('');
    const [age, setAge] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const navigate = useNavigate();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        const ageNum = parseInt(age);
        if (isNaN(ageNum) || ageNum < 18 || ageNum > 60) {
            setError('Age must be between 18 and 60.');
            return;
        }

        if (phoneNumber.length !== 10) {
            setError('Phone number must be exactly 10 digits.');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: fullName, age: ageNum, phone: phoneNumber, password })
            });
            const data = await res.json();

            if (data.status === 'success') {
                setSuccess('Registration successful. Directing to setup...');
                if (data.token) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    localStorage.setItem('role', 'worker');
                    setTimeout(() => navigate('/location-prompt'), 500);
                } else {
                    setTimeout(() => navigate('/login/worker'), 1500);
                }
            } else {
                setError(data.message || 'Registration failed');
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
                <h2 className="text-2xl font-bold text-white mb-6 text-center">Register Worker</h2>

                {error && <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded mb-4 text-sm">{error}</div>}
                {success && <div className="bg-green-500/10 border border-green-500 text-green-500 px-4 py-3 rounded mb-4 text-sm">{success}</div>}

                <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Full Name</label>
                        <input
                            type="text"
                            value={fullName}
                            onChange={e => setFullName(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-colors"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Age</label>
                        <input
                            type="number"
                            min="18"
                            max="60"
                            value={age}
                            onChange={e => setAge(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-colors"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Phone Number</label>
                        <input
                            type="tel"
                            maxLength={10}
                            placeholder="e.g. 9876543210"
                            value={phoneNumber}
                            onChange={e => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-colors"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-colors"
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

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Confirm Password</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-colors"
                            required
                        />
                    </div>

                    <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors mt-2">
                        Create Account
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <Link to="/login/worker" className="text-gray-400 hover:text-white text-sm transition-colors">
                        Already registered? Login here
                    </Link>
                </div>
            </div>
        </div>
    );
}
