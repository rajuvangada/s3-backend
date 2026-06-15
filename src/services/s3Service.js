const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3Client = require('../config/s3Client');
const logger = require('../config/logger');

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'gd-miniproject';

// Upload to S3 – in local development we may not have real AWS credentials.
// If the access key looks like a dummy placeholder, skip the actual network call
// and return a mock result so the rest of the flow (MongoDB, response) works.
// Upload a file to S3. This function now always attempts a real upload using the
// credentials/configuration available in the environment. If the environment
// provides dummy credentials, the AWS SDK will return an error, which will be
// propagated to the caller for proper handling.
const uploadFile = async (fileBuffer, key, mimeType) => {
  // Log the AWS configuration being used for debugging.
  console.log('s3Service uploadFile – AWS_REGION:', process.env.AWS_REGION);
  console.log('s3Service uploadFile – AWS_S3_BUCKET_NAME:', BUCKET_NAME);
  console.log('s3Service uploadFile – AWS_ACCESS_KEY_ID present:', !!process.env.AWS_ACCESS_KEY_ID);

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType
  });

  await s3Client.send(command);
  logger.info(`Uploaded object to S3. Key: ${key}`);
  return { key, bucket: BUCKET_NAME };
};

const deleteFile = async (key) => {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key
  });

  await s3Client.send(command);
  logger.info(`Deleted object from S3. Key: ${key}`);
};

const getPreSignedDownloadUrl = async (key, originalName, expiresInSeconds = 900) => {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(originalName)}"`
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
};

const checkBucketAccess = async () => {
  const command = new HeadBucketCommand({ Bucket: BUCKET_NAME });
  await s3Client.send(command);
  logger.info(`Verified S3 bucket access for ${BUCKET_NAME}.`);
};

module.exports = {
  uploadFile,
  deleteFile,
  getPreSignedDownloadUrl,
  checkBucketAccess
};
