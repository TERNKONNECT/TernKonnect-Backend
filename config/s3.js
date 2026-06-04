import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

const region = process.env.AWS_S3_REGION || process.env.AWS_REGION || "eu-north-1";
const bucketName = process.env.AWS_S3_BUCKET || "ternkonnect-backend-media";

// AWS SDK automatically uses AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env vars
const s3 = new S3Client({
  region,
});

/**
 * Uploads a file buffer from multer (memoryStorage) to AWS S3.
 * @param {Object} file - Multer file object
 * @param {string} folder - Folder name in S3 bucket (e.g. 'lms/avatars')
 * @returns {Promise<{url: string, key: string}>}
 */
export async function uploadToS3(file, folder) {
  if (!file || !file.buffer) {
    throw new Error("No file buffer available for upload");
  }

  // Generate a random unique ID to prevent filename collisions
  const uniqueId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  // Clean original filename to avoid special character issues in URL
  const sanitizedOriginalName = file.originalname
    .replace(/[^a-zA-Z0-9.]/g, "_")
    .substring(0, 50);
  
  const key = `${folder}/${uniqueId}-${sanitizedOriginalName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  });

  await s3.send(command);

  // Construct the public S3 URL
  const url = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

  return {
    url,
    key,
  };
}

/**
 * Deletes a file from AWS S3 using its key (or full S3 URL).
 * @param {string} key - S3 object key or URL
 * @returns {Promise<void>}
 */
export async function deleteFromS3(key) {
  if (!key) return;

  // Extract key from full URL if URL is passed
  let s3Key = key;
  if (key.startsWith("http")) {
    const match = key.match(/amazonaws\.com\/(.+)$/);
    if (match && match[1]) {
      s3Key = decodeURIComponent(match[1]);
    }
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    });
    await s3.send(command);
  } catch (err) {
    console.error(`Failed to delete object from S3 (${s3Key}):`, err.message);
  }
}

export default s3;
