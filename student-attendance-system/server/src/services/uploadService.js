const multer = require('multer');
const path = require('path');

// Set up storage for profile photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/profiles'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Initialize multer with the storage configuration
const upload = multer({ storage: storage });

// Middleware to handle file uploads
const uploadProfilePhoto = (req, res, next) => {
  upload.single('profilePhoto')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: 'Error uploading file', error: err });
    }
    next();
  });
};

module.exports = {
  uploadProfilePhoto
};