import React, { useState, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import studentService from '../../services/studentService';
import { User, Mail, Hash, BookOpen, Users, ArrowLeft, Upload, Camera, X, Check, ImagePlus } from 'lucide-react';
import toast from 'react-hot-toast';

const AddStudent = () => {
    const [formData, setFormData] = useState({
        studentId: '',
        name: '',
        email: '',
        class: '',
        section: ''
    });
    const [profilePhoto, setProfilePhoto] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [faceImage, setFaceImage] = useState(null);
    const [facePreview, setFacePreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [showCamera, setShowCamera] = useState(false);
    const [cameraStream, setCameraStream] = useState(null);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setProfilePhoto(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
            });
            setCameraStream(stream);
            setShowCamera(true);

            // Wait for next tick to ensure video element is rendered
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play().catch(console.error);
                }
            }, 100);
        } catch (error) {
            toast.error('Failed to access camera. Please allow camera permissions.');
            console.error('Camera error:', error);
        }
    }, []);

    const stopCamera = useCallback(() => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
        setShowCamera(false);
    }, [cameraStream]);

    const captureFace = useCallback(() => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;

        // Check if video is ready
        if (video.readyState < 2) {
            toast.error('Camera not ready. Please wait a moment and try again.');
            return;
        }

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        // Use actual video dimensions
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 480;

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(video, 0, 0, width, height);

        const imageData = canvas.toDataURL('image/jpeg', 0.9);
        setFaceImage(imageData);
        setFacePreview(imageData);
        stopCamera();
        toast.success('Face captured successfully!');
    }, [stopCamera]);

    const clearFaceImage = () => {
        setFaceImage(null);
        setFacePreview(null);
    };

    const handleFaceImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                toast.error('Please select an image file');
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                const imageData = event.target.result;
                setFaceImage(imageData);
                setFacePreview(imageData);
                toast.success('Face image uploaded successfully!');
            };
            reader.onerror = () => {
                toast.error('Failed to read image file');
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const data = { ...formData };
            if (profilePhoto) {
                data.profilePhoto = profilePhoto;
            }
            if (faceImage) {
                data.faceImage = faceImage;
            }

            const result = await studentService.addStudent(data);

            if (result.faceWarning) {
                toast.success('Student added successfully!');
                toast.error(`Face not registered: ${result.faceWarning}`, { duration: 5000 });
            } else {
                toast.success(result.message || 'Student added successfully' + (faceImage ? ' with face registered' : ''));
            }
            navigate('/students');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to add student');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <Link to="/students" className="inline-flex items-center text-gray-600 hover:text-gray-800">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Students
                </Link>
            </div>

            <div className="bg-card border border-gray-200 shadow-sm rounded-lg p-6">
                <h1 className="text-title mb-6">Add New Student</h1>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Profile Photo */}
                    <div className="flex flex-col items-center mb-6">
                        <div className="w-24 h-24 rounded-full bg-bgSoft flex items-center justify-center overflow-hidden mb-3">
                            {previewUrl ? (
                                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <User className="h-12 w-12 text-gray-400" />
                            )}
                        </div>
                        <label className="cursor-pointer text-primary hover:text-accent flex items-center gap-2">
                            <Upload className="h-4 w-4" />
                            <span>Upload Photo</span>
                            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                        </label>
                    </div>

                    {/* Face Recognition Capture */}
                    <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 bg-gray-50">
                        <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                            <Camera className="h-4 w-4" />
                            Face Recognition Registration (Optional)
                        </h3>

                        {showCamera ? (
                            <div className="space-y-3">
                                <div className="relative rounded-lg overflow-hidden bg-black">
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        className="w-full h-48 object-cover"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={captureFace} className="btn-primary flex-1 flex items-center justify-center gap-2">
                                        <Camera className="h-4 w-4" />
                                        Capture Face
                                    </button>
                                    <button type="button" onClick={stopCamera} className="btn-secondary flex items-center justify-center gap-2">
                                        <X className="h-4 w-4" />
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : facePreview ? (
                            <div className="space-y-3">
                                <div className="relative rounded-lg overflow-hidden">
                                    <img
                                        src={facePreview}
                                        alt="Captured face"
                                        className="w-full h-48 object-cover"
                                    />
                                    <div className="absolute top-2 right-2">
                                        <span className="bg-success text-white px-2 py-1 rounded-lg text-xs flex items-center gap-1">
                                            <Check className="h-3 w-3" />
                                            Face Captured
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={startCamera} className="btn-secondary flex-1 flex items-center justify-center gap-2">
                                        <Camera className="h-4 w-4" />
                                        Retake
                                    </button>
                                    <button type="button" onClick={clearFaceImage} className="btn-secondary flex items-center justify-center gap-2 text-danger">
                                        <X className="h-4 w-4" />
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex gap-3">
                                    <button type="button" onClick={startCamera} className="flex-1 py-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary hover:bg-primary/5 transition flex flex-col items-center gap-2 text-gray-500 hover:text-primary">
                                        <Camera className="h-8 w-8" />
                                        <span className="text-sm">Use Camera</span>
                                    </button>
                                    <label className="flex-1 py-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-success hover:bg-success/5 transition flex flex-col items-center gap-2 text-gray-500 hover:text-success cursor-pointer">
                                        <ImagePlus className="h-8 w-8" />
                                        <span className="text-sm">Upload Image</span>
                                        <input type="file" accept="image/*" onChange={handleFaceImageUpload} className="hidden" />
                                    </label>
                                </div>
                                <p className="text-xs text-gray-500 text-center">
                                    Capture or upload a clear photo of the student's face
                                </p>
                            </div>
                        )}
                        <canvas ref={canvasRef} className="hidden" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Student ID *
                            </label>
                            <div className="relative">
                                <Hash className="absolute left-1 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                                <input
                                    type="text"
                                    name="studentId"
                                    value={formData.studentId}
                                    onChange={handleChange}
                                    required
                                    className="input-field pl-12"
                                    placeholder="e.g., KUEC20xx"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Full Name *
                            </label>
                            <div className="relative">
                                <User className="absolute left-1 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                    className="input-field pl-12"
                                    placeholder="Enter student name"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Email (Optional)
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-1 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="input-field pl-12"
                                    placeholder="student@email.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Class
                            </label>
                            <div className="relative">
                                <BookOpen className="absolute left-1 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                                <input
                                    type="text"
                                    name="class"
                                    value={formData.class}
                                    onChange={handleChange}
                                    className="input-field pl-12"
                                    placeholder="e.g., 10th, 12th"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Section
                            </label>
                            <div className="relative">
                                <Users className="absolute left-1 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                                <input
                                    type="text"
                                    name="section"
                                    value={formData.section}
                                    onChange={handleChange}
                                    className="input-field pl-12"
                                    placeholder="e.g., A, B, C"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button type="button" onClick={() => navigate('/students')} className="btn-secondary flex-1">
                            Cancel
                        </button>
                        <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center">
                            {loading ? (
                                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                'Add Student'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddStudent;