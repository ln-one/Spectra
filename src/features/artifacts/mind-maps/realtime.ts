import { z } from "zod";
import { mindMapDraftSnapshotSchema } from "./contract";

const MIND_MAP_STREAM_INTERVAL_MS = 250;

export const mindMapDraftEventSchema = z
  .object({
    draft: mindMapDraftSnapshotSchema,
    event: z.literal("snapshot"),
    kind: z.literal("mind_map"),
    sequence: z.number().int().positive(),
    version: z.literal(2),
  })
  .strict();

export function shouldPublishMindMapSnapshot(lastPublishedAt: number | null, now: number) {
  return lastPublishedAt === null || now - lastPublishedAt >= MIND_MAP_STREAM_INTERVAL_MS;
}
