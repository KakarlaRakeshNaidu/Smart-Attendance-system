import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, HelpCircle } from 'lucide-react';
import { useAuth } from '../../context/authContextState';
import { Dialog } from '../common/Interface';
import toast from 'react-hot-toast';
export default function Login() {
    const { login, isAuthenticated, role } = useAuth(),
        navigate = useNavigate(),
        passwordInput = useRef(null);
    const [form, setForm] = useState({ email: '', password: '' }),
        [showPassword, setShowPassword] = useState(false),
        [loading, setLoading] = useState(false),
        [error, setError] = useState(''),
        [remember, setRemember] = useState(true),
        [help, setHelp] = useState(false);
    useEffect(() => {
        if (isAuthenticated && role)
            navigate(
                role === 'admin'
                    ? '/admin/dashboard'
                    : role === 'student'
                      ? '/student/dashboard'
                      : '/dashboard',
                { replace: true }
            );
    }, [isAuthenticated, role, navigate]);
    async function submit(event) {
        event.preventDefault();
        if (loading) return;
        setLoading(true);
        setError('');
        try {
            await login(form.email.trim(), form.password, remember);
            toast.success('Signed in');
        } catch (failure) {
            setError(
                failure.response?.data?.message || 'Unable to reach the attendance service. Please try again.'
            );
            setForm((current) => ({ ...current, password: '' }));
            passwordInput.current?.focus();
        } finally {
            setLoading(false);
        }
    }
    return (
        <div className="auth-page">
            <header className="auth-top">
                <Link to="/" className="landing-brand">
                    <GraduationCap size={24} />
                    Smart Attendance
                </Link>
                <Link to="/" className="text-sm text-zinc-400 inline-flex items-center gap-2">
                    <ArrowLeft size={16} />
                    Back to home
                </Link>
            </header>
            <main className="auth-layout">
                <section className="auth-introduction">
                    <p className="eyebrow register-context">Campus register</p>
                    <h1>
                        Your classroom.
                        <br />
                        Your records.
                        <br />
                        One workspace.
                    </h1>
                    <p className="text-lg text-zinc-400 leading-relaxed max-w-md mt-6">
                        Keep the class roster, lecture attendance, and the semester in view.
                    </p>
                    <div className="auth-roles">
                        {[
                            ['Students', 'Review attendance, course history, and corrections'],
                            ['Teachers', 'Record attendance and manage assigned classes'],
                            ['Administrators', 'Manage people, academics, and institutional records']
                        ].map(([title, text]) => (
                            <div key={title}>
                                <p className="text-sm font-medium">{title}</p>
                                <p className="text-sm text-zinc-400 mt-1">{text}</p>
                            </div>
                        ))}
                    </div>
                </section>
                <section className="auth-form-panel" aria-labelledby="sign-in-heading">
                    <div className="flex items-center justify-between gap-4 mb-8">
                        <p className="eyebrow">Institutional access</p>
                        <button
                            className="icon-button"
                            aria-label="Login assistance"
                            onClick={() => setHelp(true)}
                        >
                            <HelpCircle size={18} />
                        </button>
                    </div>
                    <h2 id="sign-in-heading" className="text-3xl font-medium ">
                        Sign in
                    </h2>
                    <p className="text-sm text-zinc-400 mt-3 mb-8">
                        Use the account provided by your institution
                    </p>
                    <form onSubmit={submit} className="space-y-5">
                        {error && (
                            <div
                                role="alert"
                                className="status-note text-red-400 border-red-400/30 bg-red-950/30"
                            >
                                {error}
                            </div>
                        )}
                        <label className="form-field" htmlFor="login-email">
                            Institutional email
                            <input
                                id="login-email"
                                name="email"
                                className="input-field"
                                type="email"
                                autoComplete="username"
                                value={form.email}
                                onChange={(event) => {
                                    setForm({ ...form, email: event.target.value });
                                    setError('');
                                }}
                                required
                                placeholder="you@college.edu"
                                disabled={loading}
                            />
                        </label>
                        <div className="form-field">
                            <div className="flex justify-between gap-4">
                                <label htmlFor="login-password">Password</label>
                                <button
                                    type="button"
                                    className="text-xs text-zinc-400 hover:text-primary"
                                    onClick={() => setHelp(true)}
                                >
                                    Forgot password?
                                </button>
                            </div>
                            <div className="relative">
                                <input
                                    ref={passwordInput}
                                    id="login-password"
                                    name="password"
                                    className="input-field pr-12"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    value={form.password}
                                    onChange={(event) => {
                                        setForm({ ...form, password: event.target.value });
                                        setError('');
                                    }}
                                    required
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    className="icon-button absolute right-1 top-0.5"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                        <label className="flex items-center gap-3 text-sm text-zinc-400">
                            <input
                                type="checkbox"
                                checked={remember}
                                onChange={(event) => setRemember(event.target.checked)}
                                disabled={loading}
                            />
                            Remember this workstation
                        </label>
                        <button
                            id="login-submit-btn"
                            type="submit"
                            className="btn-primary w-full"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Signing in…
                                </>
                            ) : (
                                <>
                                    Sign in
                                    <ArrowRight size={16} />
                                </>
                            )}
                        </button>
                    </form>
                    <p className="text-xs text-zinc-400 mt-6 leading-relaxed">
                        Students, teachers, and administrators use the same sign-in. Your account opens the
                        right workspace.
                    </p>
                </section>
            </main>
            <footer className="auth-footer">
                <span>Smart Attendance System · {new Date().getFullYear()}</span>
                <span>Accounts are managed by campus administration</span>
            </footer>
            {help && (
                <Dialog title="Account assistance" onClose={() => setHelp(false)}>
                    <div className="space-y-5">
                        <div>
                            <h3>Need an account?</h3>
                            <p className="text-sm text-zinc-400 mt-2">
                                Contact your campus administrator or department coordinator. Public
                                registration is disabled.
                            </p>
                        </div>
                        <div>
                            <h3>Forgot your password?</h3>
                            <p className="text-sm text-zinc-400 mt-2">
                                Ask your administrator to reset your password. If you received an activation
                                invitation, open its link to finish setting up your account.
                            </p>
                        </div>
                        <button className="btn-secondary" onClick={() => setHelp(false)}>
                            Back to sign in
                        </button>
                    </div>
                </Dialog>
            )}
        </div>
    );
}
