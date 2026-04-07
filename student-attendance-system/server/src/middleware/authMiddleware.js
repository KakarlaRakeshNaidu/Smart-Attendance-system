const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const Teacher = require('../models/Teacher');

const verifyToken = promisify(jwt.verify);

const protect = async (req, res, next) => {
    try {
        let token;
        
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({ 
                success: false,
                message: 'Not authorized. No token provided.' 
            });
        }

        const decoded = await verifyToken(token, process.env.JWT_SECRET);
        
        const teacher = await Teacher.findById(decoded.id);
        if (!teacher) {
            return res.status(401).json({ 
                success: false,
                message: 'Teacher not found.' 
            });
        }

        req.teacher = teacher;
        req.teacherId = teacher._id;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false,
            message: 'Token is not valid or expired.' 
        });
    }
};

module.exports = { protect };