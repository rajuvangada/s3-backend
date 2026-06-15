const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in the environment variables');
    }

    mongoose.set('strictQuery', false);
    
    await mongoose.connect(mongoUri);
    logger.info('MongoDB Atlas connected successfully.');
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1); // Fail startup if connection fails
  }
};

module.exports = connectDB;
