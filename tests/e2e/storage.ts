import { S3Client } from "@aws-sdk/client-s3";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for Source browser verification`);
  return value;
}

export const e2eStorageBucket = required("STORAGE_BUCKET");
const e2eStorageEndpoint = new URL(required("STORAGE_ENDPOINT"));

if (
  e2eStorageEndpoint.protocol !== "http:" ||
  (e2eStorageEndpoint.hostname !== "localhost" && e2eStorageEndpoint.hostname !== "127.0.0.1")
) {
  throw new Error("Source browser verification only uses loopback object storage");
}
if (!/^spectra-e2e-[a-f0-9]{32}$/.test(e2eStorageBucket)) {
  throw new Error("Source browser verification requires a random spectra-e2e-* bucket");
}

export function createE2eStorageClient() {
  return new S3Client({
    endpoint: e2eStorageEndpoint.toString(),
    region: required("STORAGE_REGION"),
    forcePathStyle: required("STORAGE_FORCE_PATH_STYLE") === "true",
    credentials: {
      accessKeyId: required("STORAGE_ACCESS_KEY_ID"),
      secretAccessKey: required("STORAGE_SECRET_ACCESS_KEY"),
    },
  });
}
