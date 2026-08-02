import "server-only";

import type { DBOSClient } from "@dbos-inc/dbos-sdk";
import { artifactDbosClient } from "./dbos-client.server";

export function artifactDbosStreamKey(attemptId: string) {
  return `artifact:${attemptId}`;
}

export async function readArtifactDbosStream(
  input: {
    attemptId: string;
  },
  getClient: () => Promise<Pick<DBOSClient, "readStream">> = artifactDbosClient,
) {
  const client = await getClient();
  const generator = client.readStream<string>(
    input.attemptId,
    artifactDbosStreamKey(input.attemptId),
  );
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await generator.return(undefined);
  };
  const stream = new ReadableStream<string>({
    async cancel() {
      await close();
    },
    async pull(controller) {
      try {
        while (!closed) {
          const { done, value } = await generator.next();
          if (done) {
            await close();
            controller.close();
            return;
          }
          if (typeof value !== "string") throw new Error("Invalid Artifact text delta");
          controller.enqueue(value);
          return;
        }
      } catch (error) {
        await close();
        controller.error(error);
      }
    },
  });
  return { close, stream };
}
