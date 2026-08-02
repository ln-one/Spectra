import {
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
} from "@aws-sdk/client-s3";
import { createE2eStorageClient, e2eStorageBucket } from "./storage";

export default async function globalTeardown() {
  const client = createE2eStorageClient();
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;

  try {
    do {
      const page = await client.send(
        new ListObjectVersionsCommand({
          Bucket: e2eStorageBucket,
          KeyMarker: keyMarker,
          VersionIdMarker: versionIdMarker,
        }),
      );
      const objects = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])].flatMap(
        ({ Key, VersionId }) => (Key && VersionId ? [{ Key, VersionId }] : []),
      );
      if (objects.length > 0) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: e2eStorageBucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
      }
      keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
      versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
    } while (keyMarker || versionIdMarker);

    await client.send(new DeleteBucketCommand({ Bucket: e2eStorageBucket }));
  } finally {
    client.destroy();
  }
}
