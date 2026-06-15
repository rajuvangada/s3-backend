const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const logger = require('./config/logger');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const { NotFoundError } = require('./utils/errors');
const mongoose = require('mongoose');
const s3Client = require('./config/s3Client');
const { ListObjectsV2Command } = require('@aws-sdk/client-s3');

// Route Imports
const authRoutes = require('./routes/authRoutes');
const folderRoutes = require('./routes/folderRoutes');
const fileRoutes = require('./routes/fileRoutes');
const shareRoutes = require('./routes/shareRoutes');

const app = express();

// 1. Security Headers
app.use(helmet());

// 2. CORS setup (supports comma-separated origins for dev + production)
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// 3. Request Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. HTTP Request Logger using Morgan and Winston
const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(
  morgan(morganFormat, {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  })
);

// 5. Health Check Endpoints
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'UP',
    message: 'StudentVault Backend Running'
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is healthy',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', async (req, res) => {
  let databaseStatus = 'DISCONNECTED';
  let s3Status = 'DISCONNECTED';

  // Check Database status
  if (mongoose.connection.readyState === 1) {
    databaseStatus = 'CONNECTED';
  }

  // Check S3 status
  if (process.env.AWS_ACCESS_KEY_ID === 'mock_access_key' || !process.env.AWS_ACCESS_KEY_ID) {
    s3Status = 'SIMULATED';
  } else {
    try {
      const bucketName = process.env.AWS_S3_BUCKET_NAME || 'studentvault-bucket';
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        MaxKeys: 1
      });
      await s3Client.send(command);
      s3Status = 'CONNECTED';
    } catch (err) {
      s3Status = 'DISCONNECTED';
    }
  }

  res.status(200).json({
    status: 'UP',
    database: databaseStatus,
    s3: s3Status,
    timestamp: new Date().toISOString()
  });
});

// 6. Global Rate Limiter
app.use('/api', apiLimiter);

// Simulated File Download endpoint
app.get('/api/files/download-simulated/*', (req, res) => {
  const originalName = req.query.filename || 'simulated-download.txt';
  res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
  res.setHeader('Content-Type', 'text/plain');
  res.send('This is a simulated file download from StudentVault in-memory developer mode.');
});

// 7. Route Mounts
app.use('/api/auth', authRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/share', shareRoutes);

// 8. 404 Route Handler
app.all('*', (req, res, next) => {
  next(new NotFoundError(`Can't find ${req.originalUrl} on this server`));
});

// 9. Centralized Error Handler
app.use(errorHandler);

module.exports = app;
