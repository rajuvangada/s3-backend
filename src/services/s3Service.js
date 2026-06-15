const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3Client = require('../config/s3Client');
const logger = require('../config/logger');

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'gd-miniproject';

const uploadFile = async (fileBuffer, key, mimeType) => {
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
