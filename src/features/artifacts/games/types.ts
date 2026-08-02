import type { z } from "zod";
import { createStructuredArtifactSchemas } from "../structured-artifact-schemas";
import { flapRevivalGameRevisionContentSchema } from "./contract";

const schemas = createStructuredArtifactSchemas("game", flapRevivalGameRevisionContentSchema);

export const gameDetailSchema = schemas.detailSchema;

export type GameArtifact = z.infer<typeof schemas.artifactSchema>;
export type GameDetail = z.infer<typeof gameDetailSchema>;
