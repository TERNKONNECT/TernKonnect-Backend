import AWS from 'aws-sdk';

const s3 = new AWS.S3({
  region: process.env.AWS_S3_REGION || process.env.AWS_REGION || "eu-north-1",
  signatureVersion: "v4",
});

export default s3;
