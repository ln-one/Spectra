import { z } from "zod";
import { artifactSourceKindSchema } from "@/features/artifacts/types";
import { sourceFileExtension } from "./validation";

const sourceVisualFamilySchema = z.enum([
  "pdf",
  "document",
  "presentation",
  "spreadsheet",
  "text",
  "table",
  "structured",
  "code",
  "captions",
  "notebook",
  "image",
  "audio",
  "video",
  "workspace",
  "neutral",
]);

export type SourceVisualFamily = z.infer<typeof sourceVisualFamilySchema>;

export const sourcePresentationHintSchema = z.discriminatedUnion("kind", [
  z
    .object({
      family: sourceVisualFamilySchema.exclude(["workspace"]),
      kind: z.literal("file"),
    })
    .strict(),
  z
    .object({
      artifactKind: artifactSourceKindSchema,
      kind: z.literal("artifact"),
    })
    .strict(),
]);

export type SourcePresentationHint = z.infer<typeof sourcePresentationHintSchema>;

export const sourceWorkspaceOriginSchema = z
  .object({
    workspaceId: z.string().uuid(),
    workspaceName: z.string().trim().min(1).max(255),
    workspaceRelation: z.enum(["current", "referenced"]),
  })
  .strict();

const sourceVisualFamilyByExtension = {
  pdf: "pdf",
  docx: "document",
  pptx: "presentation",
  xlsx: "spreadsheet",
  txt: "text",
  md: "text",
  csv: "table",
  json: "structured",
  yaml: "structured",
  yml: "structured",
  xml: "structured",
  html: "code",
  srt: "captions",
  vtt: "captions",
  ipynb: "notebook",
  py: "code",
  ts: "code",
  js: "code",
  java: "code",
  cpp: "code",
  go: "code",
  rs: "code",
  sql: "code",
  png: "image",
  jpg: "image",
  jpeg: "image",
  mp3: "audio",
  wav: "audio",
  aac: "audio",
  mp4: "video",
  mov: "video",
  mkv: "video",
  avi: "video",
  flv: "video",
  wmv: "video",
} as const;

export function sourceVisualFamily(filename: string): Exclude<SourceVisualFamily, "workspace"> {
  const extension = sourceFileExtension(filename);
  return extension ? sourceVisualFamilyByExtension[extension] : "neutral";
}

export function sourcePresentationHintForFilename(filename: string): SourcePresentationHint {
  return { family: sourceVisualFamily(filename), kind: "file" };
}
