import React, { useState, useRef, useEffect } from 'react';
import attendanceService from '../../services/attendanceService';
import { Camera, CameraOff, Users, User, CheckCircle, AlertCircle, Scan } from 'lucide-react';
import toast from 'react-hot-toast';

const FaceAttendance = ({ onAttendanceMarked, sessionId, disabledReason, onBusyChange }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [stream, setStream] = useState(null);
    const streamRef = useRef(null);
    const mountedRef = useRef(false);
    const requestRef = useRef(false);
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [loading, setLoading] = useState(false);
    const [faceApiStatus, setFaceApiStatus] = useState(null);
    const [faceError,setFaceError] = useState('');
    const [cameraError,setCameraError] = useState('');
    const [cameraStarting,setCameraStarting] = useState(false);
    const startingRef = useRef(false);
    const cameraAttempt = useRef(0);
    useEffect(() => {onBusyChange?.(loading);return () => onBusyChange?.(false);},[loading,onBusyChange]);
    const [mode, setMode] = useState('single'); // 'single' or 'multiple'
    const [lastResult, setLastResult] = useState(null);

    useEffect(() => {
        mountedRef.current = true;
        checkFaceApiStatus();
        return () => {
            mountedRef.current = false;
            streamRef.current?.getTracks().forEach(track => track.stop());
        };
    }, []);

    const checkFaceApiStatus = async () => {
        try {
            const status = await attendanceService.checkFaceApiStatus();
            if (mountedRef.current) {setFaceApiStatus(status.success);setFaceError(status.success ? '' : status.message || 'Face service is unavailable.');}
        } catch (error) {
            if (mountedRef.current) {setFaceApiStatus(false);setFaceError(error.response?.data?.message || 'Cannot connect to the face service.');}
        }
    };

    const startCamera = async () => {
        if (startingRef.current) return;
        startingRef.current = true;const attempt = ++cameraAttempt.current;setCameraStarting(true);setCameraError('');
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                }
            });

            if (!mountedRef.current || attempt !== cameraAttempt.current) { mediaStream.getTracks().forEach(track => track.stop()); return; }
            streamRef.current = mediaStream;
            setStream(mediaStream);
            setIsCameraOn(true);

            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                await videoRef.current.play();
            }
        } catch (error) {
            if (attempt !== cameraAttempt.current) return;
            const message = error.name === 'NotFoundError' ? 'No camera device was found.' : error.name === 'NotAllowedError' ? 'Camera access was denied. Please allow camera permissions.' : 'Failed to access camera: ' + (error.message || error.name);
            if (mountedRef.current) {setCameraError(message);toast.error(message);}
            streamRef.current?.getTracks().forEach(track => track.stop());streamRef.current = null;
            if (mountedRef.current) {setStream(null);setIsCameraOn(false);}
        } finally {if (attempt === cameraAttempt.current) {startingRef.current = false;if (mountedRef.current) setCameraStarting(false);}}
    };
    const stopCamera = () => {
        cameraAttempt.current++;startingRef.current = false;setCameraStarting(false);
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        streamRef.current = null;
        setStream(null);
        setIsCameraOn(false);
    };

    const captureAndRecognize = async () => {
        if (requestRef.current) return;
        if (!sessionId || disabledReason) {toast.error(disabledReason || 'Select a lecture session before marking attendance.');return;}
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;

        // Check if video is ready
        if (video.readyState < 2) {
            toast.error('Camera not ready. Please wait a moment and try again.');
            return;
        }

        requestRef.current = true;setLoading(true);
        setLastResult(null);

        try {
            const canvas = canvasRef.current;

            // Use actual video dimensions
            const width = video.videoWidth || 1280;
            const height = video.videoHeight || 720;

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, width, height);

            const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);

            let result;
            if (mode === 'single') {
                result = await attendanceService.takeFaceAttendance(imageBase64, sessionId);
            } else {
                result = await attendanceService.takeMultipleFaceAttendance(imageBase64, sessionId);
            }

            setLastResult(result);

            if (result.success) {
                if (mode === 'single' && result.student) {
                    if (result.alreadyMarked) {
                        toast.success(`${result.student.name} already marked present!`);
                    } else {
                        toast.success(`Attendance marked for ${result.student.name}`);
                    }
                } else {
                    toast.success(result.message);
                }
                if (onAttendanceMarked) onAttendanceMarked();
            } else {
                toast.error(result.message || 'Face not recognized');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to recognize face');
            setLastResult({ success: false, message: error.response?.data?.message || 'Error' });
        } finally {
            requestRef.current = false;setLoading(false);
        }
    };

    return (
        <div>
            {faceApiStatus === false && <div role="alert" className="mb-4 rounded-2xl border border-amber-900 bg-amber-500/10 p-4 text-amber-300"><p className="font-semibold">Face Recognition API Not Available</p><p>{faceError}</p><p className="text-sm mt-1">Camera preview is still available. Recognition needs the face service; Manual attendance remains usable.</p><button onClick={checkFaceApiStatus} className="btn-secondary mt-3">Retry Connection</button></div>}
            {cameraError && <p role="alert" className="mb-3 text-red-300">{cameraError}</p>}
            {(!sessionId || disabledReason) && <p className="mb-3 text-amber-300">{disabledReason || 'Select a lecture session before marking attendance.'}</p>}
            <div className="mb-4 flex gap-2">
                <button disabled={loading} onClick={() => setMode('single')} className={`flex-1 rounded-2xl border px-4 py-2.5 font-medium transition-all duration-200 flex items-center justify-center gap-2 ${mode === 'single' ? 'border-zinc-700 bg-zinc-800 text-white' : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}>
                    <User className="h-5 w-5" />
                    Single Face
                </button>
                <button disabled={loading} onClick={() => setMode('multiple')} className={`flex-1 rounded-2xl border px-4 py-2.5 font-medium transition-all duration-200 flex items-center justify-center gap-2 ${mode === 'multiple' ? 'border-zinc-700 bg-zinc-800 text-white' : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}>
                    <Users className="h-5 w-5" />
                    Multiple Faces
                </button>
            </div>

            <div className="relative mb-4 aspect-video overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${!isCameraOn ? 'hidden' : ''}`} />

                {!isCameraOn && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                        <CameraOff className="mb-4 h-16 w-16 text-zinc-600" />
                        <p className="text-zinc-500">Camera is off</p>
                    </div>
                )}

                {loading && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                        <div className="text-center text-media">
                            <Scan className="h-12 w-12 mx-auto mb-2 animate-pulse" />
                            <p>Scanning faces...</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Hidden canvas for capture */}
            <canvas ref={canvasRef} className="hidden" />

            {cameraStarting && <p className="text-amber-300 mb-3">Waiting for camera access. Check your browser permission prompt. <button className="underline" onClick={stopCamera}>Stop</button></p>}
            <div className="flex gap-3">
                {!isCameraOn ? (
                    <button onClick={startCamera} disabled={cameraStarting} className="flex-1 btn-primary flex items-center justify-center gap-2">
                        <Camera className="h-5 w-5" />
                        Start Camera
                    </button>
                ) : (
                    <>
                        <button onClick={stopCamera} className="btn-secondary flex items-center gap-2">
                            <CameraOff className="h-5 w-5" />
                            Stop
                        </button>
                        <button onClick={captureAndRecognize} disabled={loading || !sessionId || !!disabledReason} className="flex-1 btn-success flex items-center justify-center gap-2">
                            {loading ? (
                                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <>
                                    <Scan className="h-5 w-5" />
                                    {mode === 'single' ? 'Mark Attendance' : 'Scan All Faces'}
                                </>
                            )}
                        </button>
                    </>
                )}
            </div>

            {lastResult && (
                <div className={`mt-4 rounded-2xl border p-4 ${lastResult.success ? 'border-emerald-900 bg-emerald-500/10' : 'border-red-900 bg-red-500/10'}`}>
                    <div className="flex items-start gap-3">
                        {lastResult.success ? (
                            <CheckCircle className="h-6 w-6 text-emerald-300 flex-shrink-0" />
                        ) : (
                            <AlertCircle className="h-6 w-6 text-red-300 flex-shrink-0" />
                        )}
                        <div>
                            <p className={`font-semibold ${lastResult.success ? 'text-emerald-300' : 'text-red-300'}`}>
                                {lastResult.message}
                            </p>

                            {lastResult.success && mode === 'single' && lastResult.student && (
                                <p className="mt-1 text-sm text-zinc-300">
                                    Student: <span className="font-semibold">{lastResult.student.name}</span> (ID: {lastResult.student.studentId})
                                    <br />
                                    Confidence: <span className="font-semibold">{(lastResult.student.confidence * 100).toFixed(1)}%</span>
                                </p>
                            )}

                            {lastResult.success && mode === 'multiple' && (
                                <div className="mt-2 text-sm text-zinc-300">
                                    <p className="font-medium">
                                        Total faces detected: {lastResult.totalFaces}
                                    </p>
                                    {lastResult.markedStudents && lastResult.markedStudents.length > 0 && (
                                        <div className="mt-1">
                                            <p className="font-semibold text-emerald-300">Marked Present:</p>
                                            <ul className="list-disc list-inside">
                                                {lastResult.markedStudents.map((s, i) => (
                                                    <li key={i}>{s.name} ({(s.confidence * 100).toFixed(1)}%)</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {lastResult.alreadyMarkedStudents && lastResult.alreadyMarkedStudents.length > 0 && (
                                        <p className="mt-1 font-medium text-amber-300">
                                            Already marked: {lastResult.alreadyMarkedStudents.map(s => s.name).join(', ')}
                                        </p>
                                    )}
                                    {lastResult.unrecognizedCount > 0 && (
                                        <p className="mt-1 font-medium text-zinc-400">
                                            Unrecognized faces: {lastResult.unrecognizedCount}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FaceAttendance;
