const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const { generateAttendanceCSV, generateFullAttendanceCSV } = require('../services/csvService');
const faceRecognitionService = require('../services/faceRecognitionService');

// Helper to get start and end of day
const getDateRange = (date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

// @desc    Take/Mark attendance
// @route   POST /api/attendance
// @access  Private
exports.takeAttendance = async (req, res) => {
    try {
        const { records, subject, class: className, section } = req.body;
        const today = new Date();
        const { start, end } = getDateRange(today);

        // Check if attendance already exists for today
        let attendance = await Attendance.findOne({
            teacherId: req.teacherId,
            date: { $gte: start, $lte: end },
            class: className || '',
            section: section || ''
        });

        if (attendance) {
            // Update existing attendance
            for (const record of records) {
                const existingRecord = attendance.records.find(
                    r => r.studentId.toString() === record.studentId
                );
                if (existingRecord) {
                    existingRecord.status = record.status;
                    existingRecord.markedAt = new Date();
                } else {
                    const student = await Student.findById(record.studentId);
                    attendance.records.push({
                        studentId: record.studentId,
                        studentName: student ? student.name : 'Unknown',
                        studentRollNo: student ? student.studentId : 'N/A',
                        status: record.status,
                        markedAt: new Date()
                    });
                }
            }
            await attendance.save();
        } else {
            // Create new attendance
            const attendanceRecords = [];
            for (const record of records) {
                const student = await Student.findById(record.studentId);
                attendanceRecords.push({
                    studentId: record.studentId,
                    studentName: student ? student.name : 'Unknown',
                    studentRollNo: student ? student.studentId : 'N/A',
                    status: record.status,
                    markedAt: new Date()
                });
            }

            attendance = await Attendance.create({
                teacherId: req.teacherId,
                date: today,
                subject: subject || req.teacher.subject || '',
                class: className || '',
                section: section || '',
                records: attendanceRecords
            });
        }

        res.status(201).json({
            success: true,
            message: 'Attendance marked successfully',
            attendance
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error marking attendance', 
            error: error.message 
        });
    }
};

// @desc    Get today's attendance
// @route   GET /api/attendance/today
// @access  Private
exports.getTodayAttendance = async (req, res) => {
    try {
        const today = new Date();
        const { start, end } = getDateRange(today);

        const attendance = await Attendance.find({
            teacherId: req.teacherId,
            date: { $gte: start, $lte: end }
        }).populate('records.studentId', 'name studentId email');

        res.status(200).json({
            success: true,
            count: attendance.length,
            attendance
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching attendance', 
            error: error.message 
        });
    }
};

// @desc    Get attendance by date
// @route   GET /api/attendance/date/:date
// @access  Private
exports.getAttendanceByDate = async (req, res) => {
    try {
        const date = new Date(req.params.date);
        const { start, end } = getDateRange(date);

        const attendance = await Attendance.find({
            teacherId: req.teacherId,
            date: { $gte: start, $lte: end }
        }).populate('records.studentId', 'name studentId email');

        res.status(200).json({
            success: true,
            count: attendance.length,
            attendance
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching attendance', 
            error: error.message 
        });
    }
};

// @desc    Get all attendance records
// @route   GET /api/attendance
// @access  Private
exports.getAllAttendance = async (req, res) => {
    try {
        const attendance = await Attendance.find({ teacherId: req.teacherId })
            .sort({ date: -1 })
            .populate('records.studentId', 'name studentId email');

        res.status(200).json({
            success: true,
            count: attendance.length,
            attendance
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching attendance', 
            error: error.message 
        });
    }
};

// @desc    Download today's attendance as CSV
// @route   GET /api/attendance/download/today
// @access  Private
exports.downloadTodayAttendanceCSV = async (req, res) => {
    try {
        const today = new Date();
        const { start, end } = getDateRange(today);

        // Get all students
        const allStudents = await Student.find().sort({ studentId: 1 });
        
        if (allStudents.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'No students found in the system' 
            });
        }

        // Get today's attendance
        const attendance = await Attendance.findOne({
            teacherId: req.teacherId,
            date: { $gte: start, $lte: end }
        });

        const attendanceRecords = attendance ? attendance.records : [];
        const csvData = generateFullAttendanceCSV(allStudents, attendanceRecords, today);
        const dateStr = today.toISOString().split('T')[0];

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_${dateStr}.csv`);
        res.status(200).send(csvData);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error generating CSV', 
            error: error.message 
        });
    }
};

// @desc    Download attendance by date as CSV
// @route   GET /api/attendance/download/:date
// @access  Private
exports.downloadAttendanceCSV = async (req, res) => {
    try {
        const date = new Date(req.params.date);
        const { start, end } = getDateRange(date);

        // Validate teacherId
        if (!req.teacherId) {
            console.error('Teacher ID not found in request');
            return res.status(401).json({
                success: false,
                message: 'Teacher not authenticated'
            });
        }

        console.log(`Fetching attendance for teacher ${req.teacherId} on ${date}`);

        // Get all students
        const allStudents = await Student.find().sort({ studentId: 1 });
        
        if (allStudents.length === 0) {
            console.warn('No students found in system');
        }

        // Get attendance for the date
        const attendance = await Attendance.findOne({
            teacherId: req.teacherId,
            date: { $gte: start, $lte: end }
        });

        const attendanceRecords = attendance ? attendance.records : [];
        
        try {
            const csvData = generateFullAttendanceCSV(allStudents, attendanceRecords, date);
            const dateStr = date.toISOString().split('T')[0];

            console.log(`Generated CSV for ${dateStr}`);

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="attendance_${dateStr}.csv"`);
            res.status(200).send(csvData);
        } catch (csvError) {
            console.error('Error generating CSV:', csvError.message);
            throw csvError;
        }
    } catch (error) {
        console.error('Error in downloadAttendanceCSV:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: 'Error generating CSV: ' + error.message,
            error: error.message 
        });
    }
};

// @desc    Download attendance by date range as CSV
// @route   GET /api/attendance/download/range?fromDate=XXX&toDate=YYY
// @access  Private
exports.downloadAttendanceCSVRange = async (req, res) => {
    try {
        const { fromDate, toDate } = req.query;
        
        if (!fromDate || !toDate) {
            return res.status(400).json({
                success: false,
                message: 'Both fromDate and toDate are required'
            });
        }

        // Validate teacherId
        if (!req.teacherId) {
            console.error('Teacher ID not found in request');
            return res.status(401).json({
                success: false,
                message: 'Teacher not authenticated'
            });
        }

        // Safely parse dates
        const startDate = new Date(fromDate);
        const endDate = new Date(toDate);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format. Use YYYY-MM-DD format.'
            });
        }

        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        console.log(`Fetching attendance for teacher ${req.teacherId} from ${startDate} to ${endDate}`);

        // Get all students
        const allStudents = await Student.find().sort({ studentId: 1 });

        // Get all attendance records for the date range
        const attendanceRecords = await Attendance.find({
            teacherId: req.teacherId,
            date: { $gte: startDate, $lte: endDate }
        }).sort({ date: 1 });

        console.log(`Found ${attendanceRecords.length} attendance records`);

        // Generate all dates in range (DD-MM-YYYY format)
        const allDates = [];
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            const dd = String(currentDate.getDate()).padStart(2, '0');
            const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
            const yyyy = currentDate.getFullYear();
            allDates.push(`${dd}-${mm}-${yyyy}`);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Build attendance lookup: { "DD-MM-YYYY": { "studentRollNo": "present"|"absent" } }
        const attendanceByDate = {};
        for (const record of attendanceRecords) {
            if (!record.date) continue;
            const d = new Date(record.date);
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const yyyy = d.getFullYear();
            const dateKey = `${dd}-${mm}-${yyyy}`;
            
            if (!attendanceByDate[dateKey]) {
                attendanceByDate[dateKey] = {};
            }
            
            if (record.records && Array.isArray(record.records)) {
                for (const att of record.records) {
                    if (att.studentRollNo) {
                        attendanceByDate[dateKey][att.studentRollNo] = att.status || 'absent';
                    }
                }
            }
        }

        // Build CSV header: S.No, Student ID, Name, Class, Section, date1, date2, ...
        let csvData = `S.No,Student ID,Name,Class,Section,${allDates.join(',')}\n`;

        // Build rows: one per student
        allStudents.forEach((student, index) => {
            const row = [
                index + 1,
                student.studentId,
                `"${student.name}"`,
                student.class || 'N/A',
                student.section || 'N/A'
            ];

            // Add P or A for each date
            for (const dateKey of allDates) {
                const dateAttendance = attendanceByDate[dateKey];
                if (dateAttendance && dateAttendance[student.studentId] === 'present') {
                    row.push('P');
                } else {
                    row.push('A');
                }
            }

            csvData += row.join(',') + '\n';
        });
        
        const dateRangeStr = `${fromDate}_to_${toDate}`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="attendance_${dateRangeStr}.csv"`);
        res.status(200).send(csvData);
    } catch (error) {
        console.error('Error in downloadAttendanceCSVRange:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: 'Error generating CSV: ' + error.message,
            error: error.message 
        });
    }
};

// @desc    Take attendance via face recognition (single face)
// @route   POST /api/attendance/face
// @access  Private
exports.takeFaceAttendance = async (req, res) => {
    try {
        const { image, subject, class: className, section } = req.body;
        
        if (!image) {
            return res.status(400).json({
                success: false,
                message: 'Image is required'
            });
        }

        // Recognize face using Python API
        const faceResult = await faceRecognitionService.recognizeFace(image);
        
        console.log('Face recognition result:', JSON.stringify(faceResult, null, 2));
        
        if (!faceResult.success) {
            return res.status(400).json({
                success: false,
                message: faceResult.message || 'Face not recognized'
            });
        }

        const recognizedStudent = faceResult.students[0];
        console.log('Looking for studentId:', recognizedStudent.studentId);
        
        // Find student in MongoDB
        const student = await Student.findOne({ studentId: recognizedStudent.studentId });
        console.log('Found student:', student ? student.name : 'NOT FOUND');
        
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found in database'
            });
        }

        const today = new Date();
        const { start, end } = getDateRange(today);

        // Find or create today's attendance
        let attendance = await Attendance.findOne({
            teacherId: req.teacherId,
            date: { $gte: start, $lte: end },
            class: className || '',
            section: section || ''
        });

        const attendanceRecord = {
            studentId: student._id,
            studentName: student.name,
            studentRollNo: student.studentId,
            status: 'present',
            markedAt: new Date()
        };

        if (attendance) {
            // Check if student already marked
            const existingRecord = attendance.records.find(
                r => r.studentRollNo === student.studentId
            );
            
            if (existingRecord) {
                return res.status(200).json({
                    success: true,
                    message: `${student.name} already marked present`,
                    alreadyMarked: true,
                    student: {
                        name: student.name,
                        studentId: student.studentId,
                        confidence: recognizedStudent.confidence
                    }
                });
            }
            
            attendance.records.push(attendanceRecord);
            await attendance.save();
        } else {
            attendance = await Attendance.create({
                teacherId: req.teacherId,
                date: today,
                subject: subject || '',
                class: className || '',
                section: section || '',
                records: [attendanceRecord]
            });
        }

        res.status(201).json({
            success: true,
            message: `Attendance marked for ${student.name}`,
            student: {
                name: student.name,
                studentId: student.studentId,
                confidence: recognizedStudent.confidence
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error marking face attendance', 
            error: error.message 
        });
    }
};

// @desc    Take attendance via face recognition (multiple faces)
// @route   POST /api/attendance/face-multiple
// @access  Private
exports.takeMultipleFaceAttendance = async (req, res) => {
    try {
        const { image, subject, class: className, section } = req.body;
        
        if (!image) {
            return res.status(400).json({
                success: false,
                message: 'Image is required'
            });
        }

        // Recognize multiple faces using Python API
        const faceResult = await faceRecognitionService.recognizeMultipleFaces(image);
        
        if (!faceResult.success) {
            return res.status(400).json({
                success: false,
                message: faceResult.message || 'No faces recognized'
            });
        }

        const recognizedStudents = faceResult.recognizedStudents || [];
        
        if (recognizedStudents.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No students recognized in the image',
                totalFaces: faceResult.totalFaces,
                unrecognizedCount: faceResult.unrecognizedCount
            });
        }

        const today = new Date();
        const { start, end } = getDateRange(today);

        // Find or create today's attendance
        let attendance = await Attendance.findOne({
            teacherId: req.teacherId,
            date: { $gte: start, $lte: end },
            class: className || '',
            section: section || ''
        });

        const markedStudents = [];
        const alreadyMarkedStudents = [];
        const notFoundStudents = [];

        for (const recognized of recognizedStudents) {
            const student = await Student.findOne({ studentId: recognized.studentId });
            
            if (!student) {
                notFoundStudents.push(recognized.studentId);
                continue;
            }

            if (attendance) {
                const existingRecord = attendance.records.find(
                    r => r.studentRollNo === student.studentId
                );
                
                if (existingRecord) {
                    alreadyMarkedStudents.push({
                        name: student.name,
                        studentId: student.studentId
                    });
                    continue;
                }
            }

            markedStudents.push({
                studentId: student._id,
                studentName: student.name,
                studentRollNo: student.studentId,
                status: 'present',
                markedAt: new Date(),
                confidence: recognized.confidence
            });
        }

        if (markedStudents.length > 0) {
            if (attendance) {
                attendance.records.push(...markedStudents.map(s => ({
                    studentId: s.studentId,
                    studentName: s.studentName,
                    studentRollNo: s.studentRollNo,
                    status: s.status,
                    markedAt: s.markedAt
                })));
                await attendance.save();
            } else {
                attendance = await Attendance.create({
                    teacherId: req.teacherId,
                    date: today,
                    subject: subject || '',
                    class: className || '',
                    section: section || '',
                    records: markedStudents.map(s => ({
                        studentId: s.studentId,
                        studentName: s.studentName,
                        studentRollNo: s.studentRollNo,
                        status: s.status,
                        markedAt: s.markedAt
                    }))
                });
            }
        }

        res.status(201).json({
            success: true,
            message: `Marked attendance for ${markedStudents.length} students`,
            totalFaces: faceResult.totalFaces,
            markedStudents: markedStudents.map(s => ({
                name: s.studentName,
                studentId: s.studentRollNo,
                confidence: s.confidence
            })),
            alreadyMarkedStudents,
            notFoundStudents,
            unrecognizedCount: faceResult.unrecognizedCount
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error marking face attendance', 
            error: error.message 
        });
    }
};

// @desc    Check face recognition API status
// @route   GET /api/attendance/face-status
// @access  Private
exports.checkFaceApiStatus = async (req, res) => {
    try {
        const status = await faceRecognitionService.healthCheck();
        res.status(200).json(status);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Face Recognition API is not available'
        });
    }
};

// @desc    Reset today's attendance
// @route   DELETE /api/attendance/today
// @access  Private
exports.resetTodayAttendance = async (req, res) => {
    try {
        const today = new Date();
        const { start, end } = getDateRange(today);

        // Delete all attendance records for today
        const result = await Attendance.deleteMany({
            teacherId: req.teacherId,
            date: { $gte: start, $lte: end }
        });

        res.status(200).json({
            success: true,
            message: `Today's attendance has been reset. ${result.deletedCount} record(s) deleted.`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error resetting attendance', 
            error: error.message 
        });
    }
};