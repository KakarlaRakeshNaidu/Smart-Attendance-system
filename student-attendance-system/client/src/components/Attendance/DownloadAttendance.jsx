import React, { useState } from 'react';
import attendanceService from '../../services/attendanceService';
import { Download, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';

const DownloadAttendance = () => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);

    const handleDownload = async () => {
        setLoading(true);
        try {
            const blob = await attendanceService.downloadAttendanceCSV(date);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `attendance_${date}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success('Attendance CSV downloaded successfully');
        } catch (error) {
            toast.error('No attendance records found for this date');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto">
            <h2 className="text-section mb-4 flex items-center">
                <Download className="h-5 w-5 mr-2 text-primary" />
                Download Attendance
            </h2>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Date
                    </label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field pl-10" />
                    </div>
                </div>

                <button onClick={handleDownload} disabled={loading} className="w-full btn-primary flex items-center justify-center gap-2">
                    {loading ? (
                        <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <>
                            <Download className="h-5 w-5" />
                            Download CSV
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default DownloadAttendance;