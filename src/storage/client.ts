import "server-only";

import { S3Client } from "@aws-sdk/client-s3";
import { type StorageConfig, storageConfig } from "./config";

export function createStorageClient(config: StorageConfig = storageConfig()) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}
