const { createObjectCsvStringifier } = require('csv-writer');

const generateAttendanceCSV = (attendanceRecords, date) => {
    const csvStringifier = createObjectCsvStringifier({
        header: [
            { id: 'sno', title: 'S.No' },
            { id: 'studentId', title: 'Student ID' },
            { id: 'studentName', title: 'Name' },
            { id: 'status', title: 'Status' },
            { id: 'time', title: 'Time' }
        ]
    });

    const records = attendanceRecords.map((record, index) => ({
        sno: index + 1,
        studentId: record.studentRollNo,
        studentName: record.studentName,
        status: record.status.charAt(0).toUpperCase() + record.status.slice(1),
        time: new Date(record.markedAt).toLocaleTimeString()
    }));

    const header = csvStringifier.getHeaderString();
    const body = csvStringifier.stringifyRecords(records);
    
    return header + body;
};

// Generate CSV with ALL students (marked present or absent)
const generateFullAttendanceCSV = (allStudents, attendanceRecords, date) => {
    const csvStringifier = createObjectCsvStringifier({
        header: [
            { id: 'sno', title: 'S.No' },
            { id: 'studentId', title: 'Student ID' },
            { id: 'studentName', title: 'Name' },
            { id: 'class', title: 'Class' },
            { id: 'section', title: 'Section' },
            { id: 'status', title: 'Status' },
            { id: 'time', title: 'Time Marked' }
        ]
    });

    // Create a map of attendance records by studentId for quick lookup
    const attendanceMap = {};
    attendanceRecords.forEach(record => {
        attendanceMap[record.studentRollNo] = record;
    });

    // Generate records for ALL students
    const records = allStudents.map((student, index) => {
        const attendanceRecord = attendanceMap[student.studentId];
        const isPresent = attendanceRecord && attendanceRecord.status === 'present';
        
        return {
            sno: index + 1,
            studentId: student.studentId,
            studentName: student.name,
            class: student.class || 'N/A',
            section: student.section || 'N/A',
            status: isPresent ? 'Present' : 'Absent',
            time: attendanceRecord ? new Date(attendanceRecord.markedAt).toLocaleTimeString() : '-'
        };
    });

    const header = csvStringifier.getHeaderString();
    const body = csvStringifier.stringifyRecords(records);
    
    return header + body;
};

const generateStudentListCSV = (students) => {
    const csvStringifier = createObjectCsvStringifier({
        header: [
            { id: 'sno', title: 'S.No' },
            { id: 'studentId', title: 'Student ID' },
            { id: 'name', title: 'Name' },
            { id: 'email', title: 'Email' },
            { id: 'class', title: 'Class' },
            { id: 'section', title: 'Section' }
        ]
    });

    const records = students.map((student, index) => ({
        sno: index + 1,
        studentId: student.studentId,
        name: student.name,
        email: student.email || 'N/A',
        class: student.class || 'N/A',
        section: student.section || 'N/A'
    }));

    const header = csvStringifier.getHeaderString();
    const body = csvStringifier.stringifyRecords(records);
    
    return header + body;
};

module.exports = {
    generateAttendanceCSV,
    generateFullAttendanceCSV,
    generateStudentListCSV
};