const multer = require('multer');
const { BadRequestError } = require('../utils/errors');

// Memory storage keeps the file in memory buffer, allowing direct stream to AWS S3.
const storage = multer.memoryStorage();

/**
 * Filter allowed file formats
 */
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'image/jpeg',
    'image/png',
    'application/zip',
    'application/x-zip-compressed',
    'text/plain'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestError('Unsupported file type. Allowed: PDF, DOC/DOCX, JPEG, PNG, ZIP, and TXT.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 Megabytes limit
  }
});

// Multer debug: log each file as it is processed
upload._handleFile = ((originalHandleFile) => {
  return function (req, file, cb) {
    console.log('Multer received:', file.originalname);
    return originalHandleFile.call(this, req, file, cb);
  };
})(upload._handleFile);

module.exports = upload;
