import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, ArrowLeft, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import teacherService from '../../services/teacherService';
import toast from 'react-hot-toast';
import Card from '../common/Card';
import { useAuth } from '../../context/authContextState';

const ChangePassword = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const profilePath =
        user?.role === 'student'
            ? '/student/profile'
            : user?.role === 'admin'
              ? '/admin/profile'
              : '/profile';
    const [formData, setFormData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [showPasswords, setShowPasswords] = useState({
        current: false,
        new: false,
        confirm: false
    });
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const togglePassword = (field) => {
        setShowPasswords({ ...showPasswords, [field]: !showPasswords[field] });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.newPassword !== formData.confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }

        if (formData.newPassword.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }

        setLoading(true);

        try {
            await teacherService.changePassword(formData.currentPassword, formData.newPassword);
            toast.success('Password changed successfully');
            setFormData({
                currentPassword: '',
                newPassword: '',
                confirmPassword: ''
            });
            navigate(profilePath);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to change password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto space-y-5 page-enter">
            <button
                onClick={() => navigate(profilePath)}
                className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2 text-xs sm:text-sm font-medium text-zinc-300 transition-colors duration-200 hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to profile
            </button>

            <Card>
                <div className="mb-6 flex items-center gap-3 border-b border-zinc-800 pb-4">
                    <div className="text-zinc-400">
                        <KeyRound className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-medium text-white">Change password</h1>
                        <p className="text-sm text-zinc-400">Update your account password</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label
                            htmlFor="current-password"
                            className="block text-sm font-medium text-zinc-400 mb-2"
                        >
                            Current password
                        </label>
                        <div className="relative">
                            <input
                                type={showPasswords.current ? 'text' : 'password'}
                                name="currentPassword"
                                id="current-password"
                                autoComplete="current-password"
                                value={formData.currentPassword}
                                onChange={handleChange}
                                required
                                className="input-field pr-10"
                                placeholder="Enter your current password"
                            />
                            <button
                                type="button"
                                onClick={() => togglePassword('current')}
                                aria-label={
                                    showPasswords.current ? 'Hide current password' : 'Show current password'
                                }
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-100 transition-colors"
                            >
                                {showPasswords.current ? (
                                    <EyeOff className="h-4 w-4" />
                                ) : (
                                    <Eye className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label
                            htmlFor="new-password"
                            className="block text-sm font-medium text-zinc-400 mb-2"
                        >
                            New password
                        </label>
                        <div className="relative">
                            <input
                                type={showPasswords.new ? 'text' : 'password'}
                                name="newPassword"
                                id="new-password"
                                autoComplete="new-password"
                                minLength={6}
                                value={formData.newPassword}
                                onChange={handleChange}
                                required
                                className="input-field pr-10"
                                placeholder="Enter at least 6 characters"
                            />
                            <button
                                type="button"
                                onClick={() => togglePassword('new')}
                                aria-label={showPasswords.new ? 'Hide new password' : 'Show new password'}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-100 transition-colors"
                            >
                                {showPasswords.new ? (
                                    <EyeOff className="h-4 w-4" />
                                ) : (
                                    <Eye className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label
                            htmlFor="confirm-password"
                            className="block text-sm font-medium text-zinc-400 mb-2"
                        >
                            Confirm new password
                        </label>
                        <div className="relative">
                            <input
                                type={showPasswords.confirm ? 'text' : 'password'}
                                name="confirmPassword"
                                id="confirm-password"
                                autoComplete="new-password"
                                minLength={6}
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                required
                                className="input-field pr-10"
                                placeholder="Re-type new password"
                            />
                            <button
                                type="button"
                                onClick={() => togglePassword('confirm')}
                                aria-label={
                                    showPasswords.confirm
                                        ? 'Hide password confirmation'
                                        : 'Show password confirmation'
                                }
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-100 transition-colors"
                            >
                                {showPasswords.confirm ? (
                                    <EyeOff className="h-4 w-4" />
                                ) : (
                                    <Eye className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full btn-primary py-3 flex items-center justify-center font-medium shadow-lg"
                        >
                            {loading ? (
                                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                'Update password'
                            )}
                        </button>
                    </div>
                </form>
            </Card>
        </div>
    );
};

export default ChangePassword;
