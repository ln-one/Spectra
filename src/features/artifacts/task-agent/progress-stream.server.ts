import "server-only";

import { Buffer } from "node:buffer";

export function serializeTaskAgentProgressEvent(
  event: unknown,
  currentBytes: number,
  limits: { maxEventBytes: number; maxTotalBytes: number },
) {
  const body = JSON.stringify(event);
  const eventBytes = Buffer.byteLength(body, "utf8");
  const totalBytes = currentBytes + eventBytes;
  if (eventBytes > limits.maxEventBytes || totalBytes > limits.maxTotalBytes) {
    throw new Error("task_agent_progress_stream_size");
  }
  return { body, totalBytes };
}
