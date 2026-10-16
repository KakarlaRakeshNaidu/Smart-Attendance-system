const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({
  path: path.join(__dirname, '../.env')
});
const Account = require('../src/models/Account');
const Teacher = require('../src/models/Teacher');
const Student = require('../src/models/Student');
// Synthetic fixtures only; never modify the configured database.
const password = 'RegressionOnly!24';
const database = `attendance_regression_${crypto.randomBytes(8).toString('hex')}`;
async function seed() {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: database,
    family: 4,
    serverSelectionTimeoutMS: 10000
  });
  await Promise.all([Account.init(), Teacher.init(), Student.init()]);
  const teacher = await Teacher.create({
    name: 'Regression Teacher',
    email: 'teacher@example.test',
    password,
    subject: 'Testing'
  });
  const student = await Student.create({
    studentId: 'REG001',
    name: 'Regression Student',
    email: 'student@college.example.test',
    class: 'Test',
    section: 'A'
  });
  const otherStudent = await Student.create({
    studentId: 'REG002',
    name: 'Other Student',
    email: 'other@college.example.test'
  });
  const users = {};
  for (const role of ['teacher', 'student', 'admin']) {
    const account = new Account({
      name: `Regression ${role}`,
      email: role === 'student' ? student.email : `${role}@example.test`,
      role,
      isActive: true,
      ...(role === 'teacher' ? {
        teacherProfileId: teacher._id
      } : {}),
      ...(role === 'student' ? {
        studentProfileId: student._id
      } : {})
    });
    await account.setPassword(password);
    await account.save();
    users[role] = account;
  }
  return {
    teacher,
    student,
    otherStudent,
    users
  };
}
async function cleanup() {
  if (mongoose.connection.name === database && /^attendance_regression_[a-f0-9]{16}$/.test(database)) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
}
module.exports = {
  seed,
  cleanup,
  password
};
