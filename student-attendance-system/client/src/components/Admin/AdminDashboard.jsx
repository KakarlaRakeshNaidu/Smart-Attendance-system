import React, { useEffect, useState } from "react";
import { Link } from 'react-router-dom';
import { useAuth } from "../../context/authContextState";
import { Users, ShieldCheck, UserCheck, UserX, LogOut, RefreshCw, Plus } from "lucide-react";
import api from "../../services/api";
import toast from "react-hot-toast";
import Loader from "../common/Loader";
import CreateAccount from "./CreateAccount";

const AdminDashboard = () => {
    const { user, logout } = useAuth();
    const [accounts, setAccounts]       = useState([]);
    const [loading, setLoading]         = useState(true);
    const [actionId, setActionId]       = useState(null);
    const [showCreate, setShowCreate]   = useState(false);

    const fetchAccounts = async () => {
        try {
            const res = await api.get("/admin/accounts");
            if (res.data.success) setAccounts(res.data.accounts || []);
        } catch (e) {
            toast.error("Failed to load accounts");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAccounts(); }, []);

    const toggleStatus = async (account) => {
        if (account.role === "admin") {
            toast.error("Admin status can only be changed via CLI");
            return;
        }
        setActionId(account.id);
        try {
            const res = await api.patch(`/admin/accounts/${account.id}/status`, {
                isActive: !account.isActive
            });
            if (res.data.success) {
                toast.success(res.data.message);
                setAccounts(prev => prev.map(a =>
                    a.id === account.id ? { ...a, isActive: !a.isActive } : a
                ));
            }
        } catch (e) {
            toast.error(e.response?.data?.message || "Action failed");
        } finally {
            setActionId(null);
        }
    };

    if (loading) return <Loader />;

    const teachers = accounts.filter(a => a.role === "teacher");
    const students = accounts.filter(a => a.role === "student");
    const admins   = accounts.filter(a => a.role === "admin");

    const roleBadge = (role) => {
        const cls = role === "admin"   ? "bg-purple-500/15 text-purple-400"
                  : role === "teacher" ? "bg-blue-500/15 text-blue-400"
                  : "bg-emerald-500/15 text-emerald-400";
        const label = role === "admin"   ? "Administrator"
                    : role === "teacher" ? "Teacher"
                    : "Student";
        return <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${cls}`}>{label}</span>;
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                        <ShieldCheck className="h-6 w-6 text-purple-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-white">{user?.name}</h1>
                        <p className="text-sm text-zinc-400">Administrator Portal</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Link to="/students" className="btn-secondary px-4 py-2 text-sm">Students</Link>
                    <Link to="/change-password" className="btn-secondary px-4 py-2 text-sm">Change password</Link>
                    <button
                        id="admin-create-account-btn"
                        onClick={() => setShowCreate(true)}
                        className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
                    >
                        <Plus className="h-4 w-4" /> Create account
                    </button>
                    <button onClick={fetchAccounts} className="btn-secondary flex items-center gap-2 text-sm">
                        <RefreshCw className="h-4 w-4" /> Refresh
                    </button>
                    <button
                        onClick={logout}
                        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-red-400 border border-zinc-800 rounded-2xl px-4 py-2 transition-colors"
                    >
                        <LogOut className="h-4 w-4" /> Logout
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="card p-5">
                    <p className="text-zinc-400 text-sm mb-1">Teachers</p>
                    <p className="text-3xl font-bold text-blue-400">{teachers.length}</p>
                </div>
                <div className="card p-5">
                    <p className="text-zinc-400 text-sm mb-1">Students</p>
                    <p className="text-3xl font-bold text-emerald-400">{students.length}</p>
                </div>
                <div className="card p-5">
                    <p className="text-zinc-400 text-sm mb-1">Administrators</p>
                    <p className="text-3xl font-bold text-purple-400">{admins.length}</p>
                </div>
            </div>

            {/* Accounts table */}
            <div className="card p-5">
                <h2 className="text-sm font-medium text-zinc-400 mb-4">All accounts ({accounts.length})</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-zinc-500 border-b border-zinc-800">
                                <th className="text-left pb-3">Name</th>
                                <th className="text-left pb-3">Email</th>
                                <th className="text-left pb-3">Account role</th>
                                <th className="text-left pb-3">Status</th>
                                <th className="text-left pb-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {accounts.map(account => (
                                <tr key={account.id}>
                                    <td className="py-3 text-zinc-200 font-medium">{account.name}</td>
                                    <td className="py-3 text-zinc-400">{account.email}</td>
                                    <td className="py-3">{roleBadge(account.role)}</td>
                                    <td className="py-3">
                                        <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                                            account.isActive
                                                ? "bg-emerald-500/15 text-emerald-400"
                                                : "bg-zinc-700/50 text-zinc-400"
                                        }`}>
                                            {account.isActive ? "Active" : account.activationPending ? "Pending activation" : "Inactive"}
                                        </span>
                                    </td>
                                    <td className="py-3">
                                        {account.role !== "admin" && (
                                            <button
                                                onClick={() => toggleStatus(account)}
                                                disabled={actionId === account.id || account.activationPending}
                                                className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                                                    account.isActive
                                                        ? "border-red-800 text-red-400 hover:bg-red-500/10"
                                                        : "border-emerald-800 text-emerald-400 hover:bg-emerald-500/10"
                                                }`}
                                            >
                                                {actionId === account.id ? (
                                                    <div className="h-3 w-3 border border-current border-t-transparent rounded-full animate-spin" />
                                                ) : account.isActive ? (
                                                    <><UserX className="h-3 w-3" /> Deactivate</>
                                                ) : (
                                                    <><UserCheck className="h-3 w-3" /> Activate</>
                                                )}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create Account modal */}
            {showCreate && (
                <CreateAccount
                    initiatorRole="admin"
                    onClose={() => setShowCreate(false)}
                    onSuccess={() => { fetchAccounts(); }}
                />
            )}
        </div>
    );
};

export default AdminDashboard;
