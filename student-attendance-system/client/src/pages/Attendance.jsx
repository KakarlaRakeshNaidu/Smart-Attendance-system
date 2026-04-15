import React, { useState } from 'react';
import { ClipboardCheck, ClipboardList, Scan, Download } from 'lucide-react';
import TakeAttendance from '../components/Attendance/TakeAttendance';
import AttendanceList from '../components/Attendance/AttendanceList';
import FaceAttendance from '../components/Attendance/FaceAttendance';
import DownloadAttendance from '../components/Attendance/DownloadAttendance';
import Card from '../components/common/Card';

const Attendance = () => {
    const [activeTab, setActiveTab] = useState('face');
    const [refreshKey, setRefreshKey] = useState(0);

    const handleAttendanceMarked = () => {
        // Refresh attendance list after marking
        setRefreshKey(prev => prev + 1);
    };

    const tabs = [
        { id: 'face', label: 'Face Recognition', icon: Scan },
        { id: 'take', label: 'Manual', icon: ClipboardCheck },
        { id: 'view', label: 'Today', icon: ClipboardList },
        { id: 'download', label: 'Download', icon: Download }
    ];

    return (
        <div className="space-y-6 animate-fadeIn">
            <div>
                <h1 className="text-title">Attendance Management</h1>
                <p className="text-subtext mt-1">Manage and track student attendance</p>
            </div>

            <Card className="overflow-hidden p-4 sm:p-6">
                <div className="mb-6">
                    <div className="inline-flex rounded-2xl border border-zinc-800 bg-zinc-950 p-1">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                                        activeTab === tab.id
                                            ? 'border border-zinc-700 bg-zinc-800 text-white'
                                            : 'border border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
                                    }`}
                                >
                                    <Icon className="h-4 w-4" />
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {activeTab === 'face' && <FaceAttendance onAttendanceMarked={handleAttendanceMarked} />}
                {activeTab === 'take' && <TakeAttendance onAttendanceMarked={handleAttendanceMarked} />}
                {activeTab === 'view' && <AttendanceList key={refreshKey} />}
                {activeTab === 'download' && <DownloadAttendance />}
            </Card>
        </div>
    );
};

export default Attendance;
