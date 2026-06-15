require('dotenv').config();
const app = require('./app');
const logger = require('./config/logger');

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  logger.info(`Server running in ${process.env.NODE_ENV || 'development'} mode on ${HOST}:${PORT}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  logger.error(err.stack);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  logger.error(err.stack);
  // Graceful shutdown
  server.close(() => {
    process.exit(1);
  });
});
