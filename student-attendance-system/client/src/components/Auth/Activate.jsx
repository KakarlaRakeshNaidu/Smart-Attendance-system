import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { GraduationCap, Lock, Eye, EyeOff, CheckCircle, AlertCircle, Users, BookOpen, ShieldCheck } from "lucide-react";
import authService from "../../services/authService";
import toast from "react-hot-toast";
import Loader from "../common/Loader";

const ROLE_META = {
    student: {
        label: "Student account",
        description: "You will be able to view your personal attendance records.",
        icon: Users,
        color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
    },
    teacher: {
        label: "Teacher account",
        description: "You will be able to manage students and mark attendance.",
        icon: BookOpen,
        color: "bg-blue-500/10 border-blue-500/20 text-blue-400"
    },
    admin: {
        label: "Administrator account",
        description: "You will be able to manage accounts and institutional records.",
        icon: ShieldCheck,
        color: "bg-purple-500/10 border-purple-500/20 text-purple-400"
    }
};

const Activate = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const rawToken = searchParams.get("token") || "";

    const [context, setContext]   = useState(null);   // { name, role, email }
    const [ctxError, setCtxError] = useState(null);
    const [ctxLoading, setCtxLoading] = useState(true);

    const [formData, setFormData] = useState({ password: "", confirmPassword: "" });
    const [showPwd, setShowPwd]   = useState(false);
    const [loading, setLoading]   = useState(false);
    const [done, setDone]         = useState(false);

    // Fetch role from server -- never trust URL parameters for role
    useEffect(() => {
        let active = true;
        setContext(null); setCtxError(null); setCtxLoading(true); setDone(false);
        if (!rawToken) {
            setCtxError("No activation token found. Use the link sent by your administrator.");
            setCtxLoading(false);
            return;
        }
        authService.getActivationContext(rawToken)
            .then(res => {
                if (!active) return;
                if (res.success) setContext(res.context);
                else setCtxError(res.message || "Invalid or expired activation token.");
            })
            .catch(error => { if (active) setCtxError(error.response?.data?.message || "Could not verify activation. Please try again."); })
            .finally(() => { if (active) setCtxLoading(false); });
        return () => { active = false; };
    }, [rawToken]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.password !== formData.confirmPassword) {
            toast.error("Passwords do not match");
            return;
        }
        if (formData.password.length < 6) {
            toast.error("Password must be at least 6 characters");
            return;
        }
        setLoading(true);
        try {
            const res = await authService.activate(rawToken, formData.password);
            if (res.success) {
                setDone(true);
                toast.success("Account activated!");
            } else {
                toast.error(res.message || "Activation failed");
            }
        } catch (err) {
            toast.error(err.response?.data?.message || "Activation failed");
        } finally {
            setLoading(false);
        }
    };

    const roleMeta = context ? (ROLE_META[context.role] || ROLE_META.student) : null;
    const RoleIcon = roleMeta ? roleMeta.icon : null;

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 py-12 px-4">
            <div className="max-w-md w-full">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="flex justify-center mb-4">
                            <div className="p-3 bg-zinc-800 rounded-2xl border border-zinc-700">
                                <GraduationCap className="h-10 w-10 text-zinc-100" />
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold text-white">
                            {ctxLoading ? "Loading..." : context ? `Activate your ${roleMeta.label}` : "Account Activation"}
                        </h1>
                        <p className="text-zinc-400 mt-2 text-sm">Set your password to activate your account.</p>
                    </div>

                    {/* Context loading */}
                    {ctxLoading && (
                        <div className="flex justify-center py-6">
                            <div className="h-8 w-8 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                        </div>
                    )}

                    {/* Context error */}
                    {!ctxLoading && ctxError && (
                        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 flex items-start gap-3 mb-6">
                            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-300">{ctxError}</p>
                        </div>
                    )}

                    {/* Role badge -- server-confirmed, not URL-supplied */}
                    {!ctxLoading && context && !done && (
                        <>
                            <div className={`rounded-xl border p-4 mb-6 flex items-start gap-3 ${roleMeta.color}`}>
                                <RoleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-semibold">Account role: {context.role.charAt(0).toUpperCase() + context.role.slice(1)}</p>
                                    <p className="text-xs mt-0.5 opacity-80">{roleMeta.description}</p>
                                </div>
                            </div>

                            {context.name && (
                                <p className="text-sm text-zinc-400 mb-4">
                                    Activating account for <span className="text-zinc-200 font-medium">{context.name}</span>
                                </p>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">New password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                        <input
                                            id="activate-password"
                                            type={showPwd ? "text" : "password"}
                                            value={formData.password}
                                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                                            required
                                            className="input-field pl-10 pr-10"
                                            placeholder="Min 6 characters"
                                            autoComplete="new-password"
                                        />
                                        <button type="button" onClick={() => setShowPwd(!showPwd)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                                            {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">Confirm password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                        <input
                                            id="activate-confirm-password"
                                            type={showPwd ? "text" : "password"}
                                            value={formData.confirmPassword}
                                            onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                                            required
                                            className="input-field pl-10"
                                            placeholder="Repeat password"
                                            autoComplete="new-password"
                                        />
                                    </div>
                                </div>
                                <button
                                    id="activate-submit"
                                    type="submit"
                                    disabled={loading}
                                    className="btn-primary w-full py-3 mt-2 flex items-center justify-center"
                                >
                                    {loading
                                        ? <div className="h-5 w-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                        : `Activate ${roleMeta.label}`
                                    }
                                </button>
                            </form>
                        </>
                    )}

                    {/* Success */}
                    {done && (
                        <div className="text-center">
                            <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto mb-4" />
                            <p className="text-white font-medium mb-1">{roleMeta.label} activated!</p>
                            <p className="text-zinc-400 text-sm mb-6">
                                You can now log in with <span className="text-zinc-200">{context?.email}</span> and your new password.
                            </p>
                            <button
                                id="activate-goto-login"
                                onClick={() => navigate("/login")}
                                className="btn-primary w-full py-3"
                            >
                                Go to login
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Activate;
