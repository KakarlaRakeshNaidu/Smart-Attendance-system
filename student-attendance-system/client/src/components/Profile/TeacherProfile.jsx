import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { User, ArrowRight, LogOut, KeyRound, Pencil } from 'lucide-react';
import { useAuth } from '../../context/authContextState';
import { PageHeader, Dialog } from '../common/Interface';
import Loader from '../common/Loader';
export default function TeacherProfile() {
    const { user, teacher, role, logout, loading } = useAuth(),
        [confirm, setConfirm] = useState(false);
    if (loading) return <Loader />;
    const profile = teacher || user,
        origin =
            import.meta.env.VITE_API_BASE_URL ||
            (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin);
    return (
        <div className="page-stack">
            <PageHeader
                title="Profile"
                description="Your campus account and profile details"
                actions={
                    <Link to="/profile/edit" className="btn-primary">
                        <Pencil size={16} />
                        Edit profile
                    </Link>
                }
            />
            <section className="profile-summary">
                <div className="profile-avatar">
                    {profile?.profilePhoto ? (
                        <img
                            src={origin + profile.profilePhoto}
                            alt={profile?.name || 'Profile'}
                            width="96"
                            height="96"
                        />
                    ) : (
                        <User size={32} />
                    )}
                </div>
                <div>
                    <p className="eyebrow">
                        {role === 'admin' ? 'Administrator account' : 'Teaching account'}
                    </p>
                    <h2 className="text-2xl mt-2">{profile?.name || 'My profile'}</h2>
                    <p className="text-sm text-zinc-400 mt-2">{profile?.email || user?.email}</p>
                </div>
            </section>
            <div className="profile-grid">
                <section className="card space-y-6">
                    <h2>Account details</h2>
                    <dl className="profile-details">
                        {[
                            ['Full name', profile?.name],
                            ['Institutional email', profile?.email || user?.email],
                            ['Role', role === 'admin' ? 'Administrator' : 'Teacher'],
                            [
                                'Subject / department',
                                profile?.subject ||
                                    (role === 'admin' ? 'System administration' : 'Not provided')
                            ]
                        ].map(([label, value]) => (
                            <div key={label}>
                                <dt>{label}</dt>
                                <dd>{value || 'Not provided'}</dd>
                            </div>
                        ))}
                    </dl>
                    <p className="field-hint">
                        Official account details are managed by campus administration
                    </p>
                </section>
                <section className="card space-y-5">
                    <h2>About</h2>
                    <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">
                        {profile?.description || 'Add a brief introduction to your campus profile.'}
                    </p>
                    <Link to="/profile/edit" className="text-sm text-primary inline-flex gap-2 items-center">
                        Update introduction
                        <ArrowRight size={16} />
                    </Link>
                </section>
            </div>
            <section className="card">
                <h2 className="mb-5">Account settings</h2>
                <div className="settings-row">
                    <div className="flex items-center gap-4">
                        <KeyRound size={18} className="text-zinc-400" />
                        <div>
                            <h3>Password</h3>
                            <p className="text-sm text-zinc-400 mt-1">
                                Update the password for your campus account
                            </p>
                        </div>
                    </div>
                    <Link to="/change-password" className="btn-secondary">
                        Change password
                    </Link>
                </div>
                <div className="settings-row">
                    <div className="flex items-center gap-4">
                        <LogOut size={18} className="text-zinc-400" />
                        <div>
                            <h3>Current session</h3>
                            <p className="text-sm text-zinc-400 mt-1">Sign out of this workstation</p>
                        </div>
                    </div>
                    <button className="btn-secondary" onClick={() => setConfirm(true)}>
                        Sign out
                    </button>
                </div>
            </section>
            {confirm && (
                <Dialog title="Sign out of this workstation?" onClose={() => setConfirm(false)}>
                    <p className="text-sm text-zinc-400">You can sign in again with your campus account</p>
                    <div className="flex justify-end gap-3 mt-6">
                        <button className="btn-secondary" onClick={() => setConfirm(false)}>
                            Cancel
                        </button>
                        <button className="btn-primary" onClick={logout}>
                            Sign out
                        </button>
                    </div>
                </Dialog>
            )}
        </div>
    );
}
