const respondError = require('../utils/respondError');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const faceRecognitionService = require('../services/faceRecognitionService');

const attendanceScope = req => req.userRole === 'admin'
    ? (req.query.teacherId ? { teacherId: req.query.teacherId } : {})
    : { teacherId: req.teacherId };
const reads = require('../services/attendanceReadService');
const exportAttendance = async(req,res,from,to) => {
    const documents = await reads.read(req,from,to);
    res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="attendance.csv"'}).send(reads.csv(documents));
};
// Helper to get start and end of day
const getDateRange = (date) => {
    if (isNaN(new Date(date).getTime())) throw { status: 400, publicMessage: 'Invalid date. Use YYYY-MM-DD.', code: 'INVALID_DATE' };
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
        if (!Array.isArray(records) || !records.length || records.some(r => !r || !require('mongoose').isObjectIdOrHexString(r.studentId) || !['present', 'absent', 'late'].includes(r.status))) {
            return res.status(400).json({ success: false, message: 'Provide student IDs and valid attendance statuses.' });
        }
        const ids = records.map(r => String(r.studentId));
        if (new Set(ids).size !== ids.length || await Student.countDocuments({ _id: { $in: ids } }) !== ids.length) {
            return res.status(400).json({ success: false, message: 'Records must contain distinct, existing students.' });
        }
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
        return respondError(res, error);
    }
};

// @desc    Get today's attendance
// @route   GET /api/attendance/today
// @access  Private
exports.getTodayAttendance = async (req,res) => {
    try { const day = require('../services/academicService').campusDate(new Date());
        const attendance = await reads.read(req,day,day);res.json({success:true,count:attendance.length,attendance});
    } catch(error) { respondError(res,error); }
};
exports.getAttendanceByDate = async (req,res) => {
    try { const attendance = await reads.read(req,req.params.date,req.params.date);res.json({success:true,count:attendance.length,attendance}); }
    catch(error) { respondError(res,error); }
};
exports.getAllAttendance = async (req,res) => {
    try { const attendance = await reads.read(req);res.json({success:true,count:attendance.length,attendance}); }
    catch(error) { respondError(res,error); }
};
// @desc    Download today's attendance as CSV
// @route   GET /api/attendance/download/today
// @access  Private
exports.downloadTodayAttendanceCSV=async(req,res)=>{
    try {const date=require('../services/academicService').campusDate(new Date());await exportAttendance(req,res,date,date);}
    catch(error){respondError(res,error);}
};
exports.downloadAttendanceCSV=async(req,res)=>{
    try {await exportAttendance(req,res,req.params.date,req.params.date);}
    catch(error){respondError(res,error);}
};
exports.downloadAttendanceCSVRange=async(req,res)=>{
    try {await exportAttendance(req,res,req.query.fromDate,req.query.toDate);}
    catch(error){respondError(res,error);}
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
        

        
        if (!faceResult.success) {
            return res.status(faceResult.httpStatus || 400).json({
                success: false,
                code: faceResult.code,
                message: faceResult.message || 'Face not recognized'
            });
        }

        if (!Array.isArray(faceResult.students) || !faceResult.students[0]?.studentId) {
            return res.status(502).json({ success: false, message: 'Face service returned an invalid match.' });
        }
        const recognizedStudent = faceResult.students[0];
        
        // Find student in MongoDB
        const student = await Student.findOne({ studentId: recognizedStudent.studentId });
        
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
            
            if (existingRecord && existingRecord.status !== 'present') { existingRecord.status = 'present'; existingRecord.markedAt = new Date(); await attendance.save(); }
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
        return respondError(res, error);
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
            return res.status(faceResult.httpStatus || 400).json({
                success: false,
                code: faceResult.code,
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
                    if (existingRecord.status !== 'present') { existingRecord.status = 'present'; existingRecord.markedAt = new Date(); await attendance.save(); }
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
        return respondError(res, error);
    }
};

// @desc    Check face recognition API status
// @route   GET /api/attendance/face-status
// @access  Private
exports.checkFaceApiStatus = async (req, res) => {
    try {
        const status = await faceRecognitionService.checkHealth();
        res.status(200).json(status);
    } catch (error) {
        return respondError(res, error);
    }
};

// @desc    Process single photo for bulk attendance (multiple photos)
// @route   POST /api/attendance/bulk-photos
// @access  Private
exports.bulkPhotoAttendance = async (req, res) => {
    try {
        const { image } = req.body;
        
        if (!image) {
            return res.status(400).json({
                success: false,
                message: 'Image is required'
            });
        }

        // Recognize multiple faces using Python API
        const faceResult = await faceRecognitionService.recognizeMultipleFaces(image);
        
        if (!faceResult.success) {
            return res.status(faceResult.httpStatus || 400).json({
                success: false,
                code: faceResult.code,
                message: faceResult.message || 'No faces recognized',
                totalFaces: faceResult.totalFaces || 0
            });
        }

        const recognizedStudents = faceResult.recognizedStudents || [];
        
        const today = new Date();
        const { start, end } = getDateRange(today);

        // Find or create today's attendance (without class/section filter for bulk photo)
        let attendance = await Attendance.findOne({
            teacherId: req.teacherId,
            date: { $gte: start, $lte: end }
        });

        const markedStudents = [];

        for (const recognized of recognizedStudents) {
            const student = await Student.findOne({ studentId: recognized.studentId });
            
            if (!student) {
                continue;
            }

            if (attendance) {
                const existingRecord = attendance.records.find(
                    r => r.studentRollNo === student.studentId
                );
                
                if (existingRecord) {
                    if (existingRecord.status !== 'present') { existingRecord.status = 'present'; existingRecord.markedAt = new Date(); await attendance.save(); }
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
                    subject: '',
                    class: '',
                    section: '',
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
            success: markedStudents.length > 0,
            message: markedStudents.length > 0 
                ? `Marked attendance for ${markedStudents.length} student(s)`
                : 'No new students to mark',
            totalFaces: faceResult.totalFaces || 0,
            markedCount: markedStudents.length,
            recognized: markedStudents.map(s => ({
                name: s.studentName,
                studentId: s.studentRollNo,
                confidence: s.confidence
            }))
        });
    } catch (error) {
        return respondError(res, error);
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
        return respondError(res, error);
    }
};
// @desc    Get own attendance (student self-access)
// Returns only records where studentId matches the student's own profile
exports.getMyAttendance = async (req, res) => {
    try {
        const studentProfileId = req.account && req.account.studentProfileId;
        if (!studentProfileId) {
            return res.status(404).json({ success: false, message: 'No student profile linked' });
        }
        // Find all attendance documents that contain a record for this student
        const attendanceDocs = await Attendance.find({
            'records.studentId': studentProfileId
        }).select('date subject class section records').sort({ date: -1 });

        // Filter records to only include this student's own record
        const myRecords = attendanceDocs.map(doc => {
            const myRecord = doc.records.find(
                r => String(r.studentId) === String(studentProfileId)
            );
            return {
                date: doc.date,
                subject: doc.subject,
                class: doc.class,
                section: doc.section,
                status: myRecord ? myRecord.status : 'absent',
                markedAt: myRecord ? myRecord.markedAt : null
            };
        }).filter(Boolean);

        return res.status(200).json({ success: true, count: myRecords.length, attendance: myRecords });
    } catch (error) {
        return respondError(res, error);
    }
};
