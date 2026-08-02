import { z } from "zod";

const PROGRESS_MARKER = "SPECTRA_PPT_PROGRESS_V1 ";
const MAX_OBSERVATION_NODES = 1_000;
const MAX_OBSERVATION_TEXT_LENGTH = 128 * 1024;
const MAX_PROGRESS_PAYLOAD_LENGTH = 2_048;

const presentationProgressSchema = z
  .object({
    durationMs: z
      .number()
      .int()
      .nonnegative()
      .max(24 * 60 * 60_000)
      .optional(),
    failureCode: z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .max(100)
      .optional(),
    issues: z
      .object({
        boundsOutside: z.number().int().nonnegative().max(10_000),
        overlap: z.number().int().nonnegative().max(10_000),
        textOverflow: z.number().int().nonnegative().max(10_000),
      })
      .strict()
      .optional(),
    iteration: z.number().int().positive().max(1_000).optional(),
    operation: z.enum(["check", "convert", "generated", "repairing", "render"]).optional(),
    pageNumber: z.number().int().positive().max(10_000).optional(),
    pagePath: z.string().min(1).max(500).optional(),
    phase: z.enum(["design", "outline", "pptd", "pptx", "screenshot", "visual_check"]),
    status: z.enum(["completed", "failed", "progress", "started"]),
    totalPages: z.number().int().positive().max(10_000).optional(),
    version: z.literal(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.pageNumber !== undefined &&
      value.totalPages !== undefined &&
      value.pageNumber > value.totalPages
    ) {
      context.addIssue({
        code: "custom",
        message: "pageNumber must not exceed totalPages",
        path: ["pageNumber"],
      });
    }
    if (value.status === "failed" && !value.failureCode) {
      context.addIssue({
        code: "custom",
        message: "failed progress requires failureCode",
        path: ["failureCode"],
      });
    }
  });

export type PresentationProgress = z.infer<typeof presentationProgressSchema>;

export type ParsedPresentationProgress = {
  observationEventId: string;
  progress: PresentationProgress;
  progressId: string;
};

function observationStrings(observation: unknown) {
  const strings: string[] = [];
  const queue: unknown[] = [observation];
  let visited = 0;
  while (queue.length > 0 && visited < MAX_OBSERVATION_NODES) {
    visited += 1;
    const value = queue.shift();
    if (typeof value === "string") {
      if (value.length <= MAX_OBSERVATION_TEXT_LENGTH) strings.push(value);
      continue;
    }
    if (Array.isArray(value)) {
      queue.push(...value);
      continue;
    }
    if (value && typeof value === "object") {
      queue.push(...Object.values(value));
    }
  }
  return strings;
}

function markerSourceTexts(record: Record<string, unknown>): string[] | null {
  if (record.kind === "ObservationEvent" && record.source === "environment") {
    return observationStrings(record.observation);
  }
  // Page progress is reported by the presentation PostToolUse file_editor hook,
  // whose stdout lands on its own HookExecutionEvent rather than on the tool
  // observation. Only PostToolUse hooks emit presentation markers.
  if (
    record.kind === "HookExecutionEvent" &&
    record.source === "hook" &&
    record.hook_event_type === "PostToolUse" &&
    typeof record.stdout === "string"
  ) {
    return [record.stdout];
  }
  return null;
}

export function parsePresentationProgressEvents(
  events: readonly unknown[],
): ParsedPresentationProgress[] {
  const parsed: ParsedPresentationProgress[] = [];
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const record = event as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id.length === 0) continue;
    const texts = markerSourceTexts(record);
    if (texts === null) continue;

    let markerIndex = 0;
    const seenPayloads = new Set<string>();
    for (const text of texts) {
      for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith(PROGRESS_MARKER)) continue;
        const payload = line.slice(PROGRESS_MARKER.length);
        if (payload.length === 0 || payload.length > MAX_PROGRESS_PAYLOAD_LENGTH) continue;
        if (seenPayloads.has(payload)) continue;
        seenPayloads.add(payload);
        let value: unknown;
        try {
          value = JSON.parse(payload);
        } catch {
          continue;
        }
        const progress = presentationProgressSchema.safeParse(value);
        if (!progress.success) continue;
        parsed.push({
          observationEventId: record.id,
          progress: progress.data,
          progressId: `${record.id}:${markerIndex}`,
        });
        markerIndex += 1;
      }
    }
  }
  return parsed;
}
