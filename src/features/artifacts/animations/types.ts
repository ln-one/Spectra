import type { z } from "zod";
import { createTaskAgentArtifactSchemas } from "@/features/artifacts/task-agent/artifact-schemas";
import { animationGenerationDraftSchema, animationRevisionContentSchema } from "./contract";

const schemas = createTaskAgentArtifactSchemas(
  "animation",
  animationRevisionContentSchema,
  animationGenerationDraftSchema,
);

export const animationDetailSchema = schemas.detailSchema;

export type AnimationDetail = z.infer<typeof schemas.detailSchema>;
