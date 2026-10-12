const jwt = require('jsonwebtoken');

/**
 * Generate a signed JWT for an Account document.
 * The token payload carries only { id: account._id }.
 * Role and active status are always verified from the database on each request.
 */
const generateToken = (accountId) => {
    return jwt.sign(
        { id: accountId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

const verifyToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return null;
    }
};

const decodeToken = (token) => {
    return jwt.decode(token);
};

module.exports = {
    generateToken,
    verifyToken,
    decodeToken
};
