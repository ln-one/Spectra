import type { z } from "zod";
import { createStructuredArtifactSchemas } from "../structured-artifact-schemas";
import { quizRevisionContentSchema } from "./contract";

const schemas = createStructuredArtifactSchemas("quiz", quizRevisionContentSchema);

export const quizArtifactSchema = schemas.artifactSchema;
export const quizDetailSchema = schemas.detailSchema;

export type QuizArtifact = z.infer<typeof quizArtifactSchema>;
export type QuizDetail = z.infer<typeof quizDetailSchema>;
