const { S3Client } = require('@aws-sdk/client-s3');
const logger = require('./logger');

const s3Config = {
  region: process.env.AWS_REGION || 'us-east-1'
};

// If static credentials are provided in the environment, use them (typically local development)
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  s3Config.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  };
  logger.info(`AWS S3 Client initialized in region: ${s3Config.region} using environment credentials.`);
} else {
  // Otherwise, fallback to AWS Default Credentials Provider Chain (essential for production EC2 IAM roles)
  logger.info(`AWS S3 Client initialized in region: ${s3Config.region} using AWS Instance Profile/IAM credentials chain.`);
}

const s3Client = new S3Client(s3Config);

module.exports = s3Client;
