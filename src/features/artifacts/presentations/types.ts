import type { z } from "zod";
import { createTaskAgentArtifactSchemas } from "@/features/artifacts/task-agent/artifact-schemas";
import { presentationGenerationDraftSchema, presentationRevisionContentSchema } from "./contract";

const schemas = createTaskAgentArtifactSchemas(
  "presentation",
  presentationRevisionContentSchema,
  presentationGenerationDraftSchema,
);

export const presentationDetailSchema = schemas.detailSchema;

export type PresentationDetail = z.infer<typeof schemas.detailSchema>;
