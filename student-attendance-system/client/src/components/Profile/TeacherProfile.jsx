import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, Mail, BookOpen, FileText, Edit3, Camera } from 'lucide-react';
import { Link } from 'react-router-dom';
import Loader from '../common/Loader';
import Card from '../common/Card';

const TeacherProfile = () => {
    const { teacher, loading } = useAuth();

    if (loading) {
        return <Loader />;
    }

    const profilePhotoUrl = teacher?.profilePhoto
        ? `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}${teacher.profilePhoto}`
        : null;

    return (
        <div className="space-y-6 animate-fadeIn">
            <Card className="overflow-hidden">
                <div className="h-32 bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900"></div>

                <div className="relative px-6 pb-6">
                    <div className="absolute -top-14 left-6">
                        <div className="relative">
                            {profilePhotoUrl ? (
                                <img src={profilePhotoUrl} alt="Profile" className="h-28 w-28 rounded-full border-4 border-zinc-900 object-cover shadow-md" />
                            ) : (
                                <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-zinc-900 bg-zinc-800 shadow-md">
                                    <User className="h-12 w-12 text-zinc-200" />
                                </div>
                            )}
                            <Link to="/profile/edit" className="absolute bottom-1 right-1 rounded-full border border-zinc-700 bg-zinc-900 p-2 text-zinc-100 transition-all duration-200 hover:bg-zinc-800">
                                <Camera className="h-4 w-4" />
                            </Link>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4">
                        <Link to="/profile/edit" className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-100 transition-all duration-200 hover:bg-zinc-800 flex items-center gap-2">
                            <Edit3 className="h-4 w-4" />
                            Edit Profile
                        </Link>
                    </div>

                    <div className="mt-10">
                        <h1 className="text-title">{teacher?.name || 'Teacher'}</h1>

                        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                                <div className="rounded-xl bg-zinc-800 p-2">
                                    <Mail className="h-5 w-5 text-zinc-200" />
                                </div>
                                <div>
                                    <p className="text-sm text-zinc-500">Email</p>
                                    <p className="font-semibold text-zinc-100">{teacher?.email}</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                                <div className="rounded-xl bg-zinc-800 p-2">
                                    <BookOpen className="h-5 w-5 text-zinc-200" />
                                </div>
                                <div>
                                    <p className="text-sm text-zinc-500">Subject</p>
                                    <p className="font-semibold text-zinc-100">{teacher?.subject || 'Not specified'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6">
                            <div className="flex items-center gap-2 mb-2">
                                <FileText className="h-5 w-5 text-zinc-400" />
                                <h3 className="font-semibold text-zinc-200">About Me</h3>
                            </div>
                            <p className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-zinc-300">
                                {teacher?.description || 'No description added yet. Click Edit Profile to add one.'}
                            </p>
                        </div>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Link to="/profile/edit" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 transition-all duration-200 hover:bg-zinc-800 flex items-center gap-3">
                    <div className="rounded-xl bg-zinc-800 p-3">
                        <Edit3 className="h-6 w-6 text-zinc-200" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-zinc-100">Edit Profile</h3>
                        <p className="text-sm text-zinc-400">Update your information</p>
                    </div>
                </Link>
                <Link to="/change-password" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 transition-all duration-200 hover:bg-zinc-800 flex items-center gap-3">
                    <div className="rounded-xl bg-zinc-800 p-3">
                        <FileText className="h-6 w-6 text-zinc-200" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-zinc-100">Change Password</h3>
                        <p className="text-sm text-zinc-400">Update your password</p>
                    </div>
                </Link>
            </div>
        </div>
    );
};

export default TeacherProfile;