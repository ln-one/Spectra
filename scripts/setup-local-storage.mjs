import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketVersioningCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required in .env.local`);
  return value;
}

const endpoint = new URL(required("STORAGE_ENDPOINT"));
if (endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1") {
  throw new Error("storage:setup only provisions loopback development storage");
}

const bucket = required("STORAGE_BUCKET");
const client = new S3Client({
  endpoint: endpoint.toString(),
  region: required("STORAGE_REGION"),
  forcePathStyle: required("STORAGE_FORCE_PATH_STYLE") === "true",
  credentials: {
    accessKeyId: required("STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: required("STORAGE_SECRET_ACCESS_KEY"),
  },
});

try {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status !== 404) throw error;
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }

  await client.send(
    new PutBucketVersioningCommand({
      Bucket: bucket,
      VersioningConfiguration: { Status: "Enabled" },
    }),
  );
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET", "HEAD", "PUT"],
            AllowedOrigins: ["http://localhost:3000"],
            ExposeHeaders: ["ETag", "x-amz-version-id"],
          },
        ],
      },
    }),
  );
  console.log(`Local object storage bucket is ready: ${bucket}`);
} finally {
  client.destroy();
}
