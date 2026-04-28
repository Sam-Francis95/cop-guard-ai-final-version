import { ShieldAlert, User, ShieldHalf } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Landing() {
    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-gray-100 font-sans">
            <div className="flex items-center space-x-3 mb-10">
                <ShieldAlert className="text-blue-500 w-12 h-12" />
                <h1 className="text-4xl font-bold tracking-wider uppercase">CopGuard<span className="text-blue-500">AI</span></h1>
            </div>

            <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8">
                <Link to="/login/admin" className="group">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 hover:border-blue-500 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] transition-all cursor-pointer h-full flex flex-col items-center text-center space-y-4">
                        <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                            <ShieldHalf className="w-10 h-10 text-blue-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Admin Login</h2>
                        <p className="text-gray-400">Access full SOC dashboard, all claims, syndicate map and fraud analytics.</p>
                    </div>
                </Link>

                <Link to="/login/worker" className="group">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 hover:border-green-500 hover:shadow-[0_0_30px_rgba(34,197,94,0.15)] transition-all cursor-pointer h-full flex flex-col items-center text-center space-y-4">
                        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                            <User className="w-10 h-10 text-green-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Worker Login</h2>
                        <p className="text-gray-400">View your own claims, check your fraud score and transparency report.</p>
                    </div>
                </Link>
            </div>
        </div>
    );
}
