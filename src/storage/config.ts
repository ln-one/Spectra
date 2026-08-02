import "server-only";

import { type ServerEnvironment, serverEnvironment } from "@/environment/server";

export type StorageConfig = {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  forcePathStyle: boolean;
  region: string;
  secretAccessKey: string;
};

export function storageConfig(environment: ServerEnvironment = serverEnvironment()): StorageConfig {
  const { STORAGE_ACCESS_KEY_ID, STORAGE_BUCKET, STORAGE_ENDPOINT, STORAGE_REGION } = environment;
  const { STORAGE_SECRET_ACCESS_KEY } = environment;
  if (
    !STORAGE_ACCESS_KEY_ID ||
    !STORAGE_BUCKET ||
    !STORAGE_ENDPOINT ||
    !STORAGE_REGION ||
    !STORAGE_SECRET_ACCESS_KEY
  ) {
    throw new Error("Storage configuration is required");
  }
  return {
    accessKeyId: STORAGE_ACCESS_KEY_ID,
    bucket: STORAGE_BUCKET,
    endpoint: STORAGE_ENDPOINT,
    forcePathStyle: environment.STORAGE_FORCE_PATH_STYLE,
    region: STORAGE_REGION,
    secretAccessKey: STORAGE_SECRET_ACCESS_KEY,
  };
}
