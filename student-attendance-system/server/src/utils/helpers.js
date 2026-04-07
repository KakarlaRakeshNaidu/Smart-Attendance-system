const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const generateHash = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
};

const compareHash = async (password, hash) => {
    return await bcrypt.compare(password, hash);
};

const generateToken = (user) => {
    return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
};

const saveFile = (file) => {
    const uploadPath = path.join(__dirname, '../../uploads/profiles', file.name);
    return new Promise((resolve, reject) => {
        file.mv(uploadPath, (err) => {
            if (err) {
                return reject(err);
            }
            resolve(uploadPath);
        });
    });
};

const readCSVFile = (filePath) => {
    return fs.readFileSync(filePath, 'utf8');
};

module.exports = {
    generateHash,
    compareHash,
    generateToken,
    saveFile,
    readCSVFile,
};