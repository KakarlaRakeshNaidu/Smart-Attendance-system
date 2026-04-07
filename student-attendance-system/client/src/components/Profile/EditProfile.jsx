import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import teacherService from '../../services/teacherService';
import { User, BookOpen, FileText, Camera, Save, ArrowLeft, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import Loader from '../common/Loader';

const EditProfile = () => {
    const { teacher, updateTeacher, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    const [formData, setFormData] = useState({
        name: '',
        subject: '',
        description: '',
    });
    const [photoFile, setPhotoFile] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (teacher) {
            setFormData({
                name: teacher.name || '',
                subject: teacher.subject || '',
                description: teacher.description || '',
            });
            if (teacher.profilePhoto) {
                setPhotoPreview(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}${teacher.profilePhoto}`);
            }
        }
    }, [teacher]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handlePhotoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setPhotoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setPhotoPreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Upload photo if selected
            if (photoFile) {
                await teacherService.uploadPhoto(photoFile);
            }

            // Update profile
            const response = await teacherService.updateProfile(formData);
            updateTeacher(response.teacher);
            toast.success('Profile updated successfully!');
            navigate('/profile');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update profile');
        } finally {
            setLoading(false);
        }
    };

    if (authLoading) {
        return <Loader />;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <button onClick={() => navigate('/profile')} className="flex items-center gap-2 text-gray-600 hover:text-gray-800">
                    <ArrowLeft className="h-5 w-5" />
                    Back to Profile
                </button>
            </div>

            <div className="bg-card border border-gray-200 shadow-sm rounded-lg p-6">
                <h1 className="text-title mb-6">Edit Profile</h1>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="flex flex-col items-center">
                        <div className="relative">
                            {photoPreview ? (
                                <img src={photoPreview} alt="Profile Preview" className="w-32 h-32 rounded-full object-cover border-4 border-gray-200" />
                            ) : (
                                <div className="w-32 h-32 rounded-full bg-bgSoft flex items-center justify-center border-4 border-gray-200">
                                    <User className="h-16 w-16 text-gray-400" />
                                </div>
                            )}
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute bottom-0 right-0 bg-primary text-white p-2 rounded-full hover:bg-accent shadow-md">
                                <Camera className="h-4 w-4" />
                            </button>
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                        </div>
                        <p className="text-sm text-gray-500 mt-2">Click to change photo</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <User className="inline h-4 w-4 mr-1" />
                            Full Name
                        </label>
                        <input type="text" name="name" value={formData.name} onChange={handleChange} className="input-field" placeholder="Enter your full name" required />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <BookOpen className="inline h-4 w-4 mr-1" />
                            Subject
                        </label>
                        <input type="text" name="subject" value={formData.subject} onChange={handleChange} className="input-field" placeholder="e.g., Mathematics, Physics, etc." />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <FileText className="inline h-4 w-4 mr-1" />
                            About Me
                        </label>
                        <textarea name="description" value={formData.description} onChange={handleChange} rows={4} className="input-field resize-none" placeholder="Write something about yourself..." />
                    </div>

                    <div className="flex gap-4">
                        <button type="button" onClick={() => navigate('/profile')} className="flex-1 btn-secondary">Cancel</button>
                        <button type="submit" disabled={loading} className="flex-1 btn-primary flex items-center justify-center gap-2">
                            {loading ? (
                                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <>
                                    <Save className="h-5 w-5" />
                                    Save Changes
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditProfile;