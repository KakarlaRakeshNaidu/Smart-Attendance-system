import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { User, Pencil, KeyRound, LogOut } from 'lucide-react';
import { useAuth } from '../../context/authContextState';
import { PageHeader, Dialog } from '../common/Interface';
import PageSkeleton from '../common/PageSkeleton';
import api from '../../services/api';
export default function StudentProfile() {
    const { user, logout } = useAuth(),
        [profile, setProfile] = useState(null),
        [loading, setLoading] = useState(true),
        [error, setError] = useState(''),
        [confirm, setConfirm] = useState(false);
    useEffect(() => {
        let active = true;
        api.get('/student/profile')
            .then((r) => {
                if (active) setProfile(r.data.student);
            })
            .catch((e) => {
                if (active) setError(e.response?.data?.message || 'Could not load your profile.');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);
    if (loading) return <PageSkeleton />;
    const origin =
        import.meta.env.VITE_API_BASE_URL ||
        (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin);
    return (
        <div className="page-stack">
            <PageHeader
                title="My profile"
                description="Your campus identity and academic details"
                actions={
                    <Link className="btn-primary" to="/my-profile">
                        <Pencil size={16} />
                        Edit profile photo
                    </Link>
                }
            />
            {error && (
                <p role="alert" className="status-note text-red-400">
                    {error}
                </p>
            )}
            <section className="profile-summary">
                <div className="profile-avatar">
                    {profile?.profilePhoto ? (
                        <img src={origin + profile.profilePhoto} alt={profile.name} width="88" height="88" />
                    ) : (
                        <User size={32} />
                    )}
                </div>
                <div>
                    <p className="eyebrow">Student account</p>
                    <h2 className="text-2xl mt-2">{profile?.name || user?.name}</h2>
                    <p className="font-mono text-sm text-zinc-400 mt-2">{profile?.studentId || '—'}</p>
                </div>
            </section>
            <section className="card space-y-6">
                <h2>Academic details</h2>
                <dl className="profile-details">
                    {[
                        ['Institutional email', profile?.email || user?.email],
                        ['Student ID', profile?.studentId],
                        ['Branch', profile?.branch],
                        ['Academic year', profile?.academicYear ? 'Year ' + profile.academicYear : '—'],
                        ['Section', profile?.section],
                        ['Subsection', profile?.subsection],
                        ['Class', profile?.class],
                        ['Account status', profile?.status || 'Active']
                    ].map(([label, value]) => (
                        <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value || '—'}</dd>
                        </div>
                    ))}
                </dl>
            </section>
            <section className="card">
                <h2 className="mb-5">Account settings</h2>
                <div className="settings-row">
                    <div className="flex gap-4 items-center">
                        <KeyRound size={18} className="text-zinc-400" />
                        <div>
                            <h3>Password</h3>
                            <p className="field-hint mt-1">Update the password for your campus account</p>
                        </div>
                    </div>
                    <Link to="/change-password" className="btn-secondary">
                        Change password
                    </Link>
                </div>
                <div className="settings-row">
                    <div className="flex gap-4 items-center">
                        <LogOut size={18} className="text-zinc-400" />
                        <div>
                            <h3>Current session</h3>
                            <p className="field-hint mt-1">Sign out of this workstation</p>
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
