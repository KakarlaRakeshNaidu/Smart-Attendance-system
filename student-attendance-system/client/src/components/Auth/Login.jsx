import React, { useRef, useState } from 'react';
import { useAuth } from '../../context/authContextState';
import { GraduationCap, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { ThemeControl } from '../common/ThemeControl';

const Login = () => {
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const submitting = useRef(false);
    const { login } = useAuth();
    const handleChange = e => setFormData(current => ({ ...current, [e.target.name]: e.target.value }));
    const handleSubmit = async e => {
        e.preventDefault();
        if (submitting.current) return;
        submitting.current = true;
        setLoading(true);
        setError('');
        // Native form values also preserve password-manager/autofill submissions.
        const values = new FormData(e.currentTarget);
        try {
            const response = await login(values.get('email'), values.get('password'));
            if (!response.success) setError(response.message || 'Sign in failed. Please try again.');
        } catch (failure) {
            setError(failure.response?.data?.message || 'Unable to sign in. Check your connection and try again.');
        } finally {
            submitting.current = false;
            setLoading(false);
        }
    };
    return <div className="login-page bg-zinc-950">
        <div className="login-container">
            <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-sm font-semibold text-zinc-100">
                    <GraduationCap className="login-brand-icon h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
                    <span>Smart Attendance System</span>
                </div>
                <ThemeControl />
            </div>
            <section className="card p-6 sm:p-8" aria-labelledby="sign-in-title">
                <h1 id="sign-in-title" className="text-2xl font-semibold text-zinc-100">Sign in</h1>
                <p className="mt-2 mb-6 text-sm text-zinc-400">Welcome back. Enter your account details.</p>
                <form onSubmit={handleSubmit} className="space-y-4" aria-describedby={error ? 'login-error' : undefined} aria-busy={loading}>
                    <div>
                        <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-zinc-300">Email address</label>
                        <div className="relative">
                            <Mail className="login-icon" aria-hidden="true" />
                            <input id="login-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={formData.email} onChange={handleChange} className="input-field login-input pl-11" placeholder="you@example.com" aria-describedby={error ? 'login-error' : undefined} />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-zinc-300">Password</label>
                        <div className="relative">
                            <Lock className="login-icon" aria-hidden="true" />
                            <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={formData.password} onChange={handleChange} className="input-field login-input pl-11 pr-12" placeholder="Your password" aria-describedby={error ? 'login-error' : undefined} />
                            <button id="login-toggle-pw" type="button" className="login-visibility" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} aria-controls="login-password" onClick={() => setShowPassword(value => !value)}>
                                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                            </button>
                        </div>
                    </div>
                    {error && <p id="login-error" role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
                    <button id="login-submit" type="submit" disabled={loading} className="btn-primary flex min-h-12 w-full items-center justify-center gap-2">
                        {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
                        {loading ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>
                <p className="mt-5 text-center text-xs leading-relaxed text-zinc-400">Contact your institution for account access.</p>
            </section>
        </div>
    </div>;
};
export default Login;
