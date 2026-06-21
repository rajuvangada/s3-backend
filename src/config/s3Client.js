const { S3Client } = require('@aws-sdk/client-s3');
const logger = require('./logger');

const s3Config = {
  region: process.env.AWS_REGION || 'eu-north-1'
};

// Prefer the default AWS credential provider chain so EC2 IAM roles work in production.
// Optional environment credentials are still supported for local development.
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  s3Config.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  };
  logger.info(`AWS S3 client initialized for ${s3Config.region} using environment credentials.`);
} else {
  logger.info(`AWS S3 client initialized for ${s3Config.region} using the default credential provider chain.`);
}

const s3Client = new S3Client(s3Config);

module.exports = s3Client;
