import React, { useState } from "react";
import { useAuth } from "../../context/authContextState";
import { GraduationCap, Mail, Lock, Eye, EyeOff, Users } from "lucide-react";
import toast from "react-hot-toast";

const Login = () => {
    const [formData, setFormData] = useState({ email: "", password: "" });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await login(formData.email, formData.password);
            if (!res.success) toast.error(res.message || "Login failed");
        } catch (error) {
            toast.error(error.response?.data?.message || "Login failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 py-12 px-4">
            <div className="max-w-md w-full">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
                    {/* Logo */}
                    <div className="text-center mb-8">
                        <div className="flex justify-center mb-4">
                            <div className="p-3 bg-zinc-800 rounded-2xl border border-zinc-700">
                                <GraduationCap className="h-10 w-10 text-zinc-100" />
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold text-white">Welcome back</h1>
                        <p className="text-zinc-400 mt-2 text-sm">
                            Sign in with your Student, Teacher or Administrator account.
                        </p>
                    </div>

                    {/* Role hint pills */}
                    <div className="flex justify-center gap-2 mb-6">
                        {[
                            { label: "Student", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
                            { label: "Teacher", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
                            { label: "Admin",   color: "bg-purple-500/10 text-purple-400 border-purple-500/20" }
                        ].map(({ label, color }) => (
                            <span key={label} className={`px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
                                {label}
                            </span>
                        ))}
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                                Email address
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                                <input
                                    id="login-email"
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                    className="input-field pl-10"
                                    placeholder="you@example.com"
                                    autoComplete="email"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                                Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                <input
                                    id="login-password"
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    required
                                    className="input-field pl-10 pr-10"
                                    placeholder="Your password"
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    id="login-toggle-pw"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        <button
                            id="login-submit"
                            type="submit"
                            disabled={loading}
                            className="btn-primary w-full py-3 mt-2 flex items-center justify-center"
                        >
                            {loading
                                ? <div className="h-5 w-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                : "Sign in"
                            }
                        </button>
                    </form>

                    <p className="mt-6 text-center text-xs text-zinc-500">
                        No account? Contact your administrator to create one.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
