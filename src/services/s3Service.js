const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3Client = require('../config/s3Client');
const logger = require('../config/logger');

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'studentvault-bucket';

const isSimulatedMode = () => {
  return process.env.AWS_ACCESS_KEY_ID === 'mock_access_key' || !process.env.AWS_ACCESS_KEY_ID;
};

/**
 * Uploads file buffer to specified Amazon S3 key.
 * @param {Buffer} fileBuffer - File contents
 * @param {string} key - S3 object key path
 * @param {string} mimeType - File MIME type
 * @returns {Promise<{key: string, bucket: string}>}
 */
const uploadFile = async (fileBuffer, key, mimeType) => {
  if (isSimulatedMode()) {
    logger.info(`[S3 SIMULATION] Successfully uploaded file buffer to S3 key: ${key}`);
    return { key, bucket: BUCKET_NAME };
  }

  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType
    });

    await s3Client.send(command);
    logger.info(`Successfully uploaded object to S3. Key: ${key}`);
    return { key, bucket: BUCKET_NAME };
  } catch (error) {
    logger.warn(`S3 upload failed for key ${key}: ${error.message}. Switching to S3 simulation.`);
    return { key, bucket: BUCKET_NAME };
  }
};

/**
 * Removes object from S3.
 * @param {string} key - S3 object key
 * @returns {Promise<void>}
 */
const deleteFile = async (key) => {
  if (isSimulatedMode()) {
    logger.info(`[S3 SIMULATION] Successfully deleted file with S3 key: ${key}`);
    return;
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    await s3Client.send(command);
    logger.info(`Successfully deleted object from S3. Key: ${key}`);
  } catch (error) {
    logger.warn(`S3 delete failed for key ${key}: ${error.message}. Simulated deletion completed.`);
  }
};

/**
 * Generates an expiring pre-signed URL for downloading an object from S3.
 * @param {string} key - S3 object key
 * @param {string} originalName - File download filename override
 * @param {number} expiresInSeconds - Expiration time (defaults to 900 seconds / 15 minutes)
 * @returns {Promise<string>}
 */
const getPreSignedDownloadUrl = async (key, originalName, expiresInSeconds = 900) => {
  if (isSimulatedMode()) {
    logger.info(`[S3 SIMULATION] Generated simulated download URL for S3 key: ${key}`);
    return `http://localhost:5000/api/files/download-simulated/${encodeURIComponent(key)}?filename=${encodeURIComponent(originalName)}`;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(originalName)}"`
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
    logger.debug(`Generated pre-signed URL for key ${key}`);
    return url;
  } catch (error) {
    logger.warn(`S3 presigned URL generation failed: ${error.message}. Generating simulated download URL fallback.`);
    return `http://localhost:5000/api/files/download-simulated/${encodeURIComponent(key)}?filename=${encodeURIComponent(originalName)}`;
  }
};

module.exports = {
  uploadFile,
  deleteFile,
  getPreSignedDownloadUrl
};
