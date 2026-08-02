import { z } from "zod";
import { ARTIFACT_PROPOSAL_TOOL_IDS } from "@/features/artifacts/proposal-contract";

export const ARTIFACT_AGENT_TOOL_IDS = {
  applyCurrentGameEdits: "apply_current_game_edits",
  applyCurrentMindMapEdits: "apply_current_mind_map_edits",
  applyCurrentQuizEdits: "apply_current_quiz_edits",
  commitArtifactPlan: "commit_artifact_plan",
  createArtifacts: "create_artifacts",
  listArtifacts: "list_artifacts",
  readMindMap: "read_mind_map",
  readTeachingDocument: "read_teaching_document",
  readCurrentArtifact: "read_current_artifact",
  proposeCurrentMindMapEdits: ARTIFACT_PROPOSAL_TOOL_IDS.mindMap,
  proposeCurrentPresentationEdits: ARTIFACT_PROPOSAL_TOOL_IDS.presentation,
  proposeCurrentQuizEdits: ARTIFACT_PROPOSAL_TOOL_IDS.quiz,
  proposeCurrentTeachingDocumentEdits: ARTIFACT_PROPOSAL_TOOL_IDS.teachingDocument,
  updateCurrentTeachingDocument: "update_current_teaching_document",
} as const;

export const artifactGroundingRefSchema = z
  .string()
  .regex(/^E(?:[1-9]|[12]\d|3[0-2])$/)
  .describe("A short Evidence ref returned by search_workspace in this run, such as E1.");

export const artifactGroundingRefsSchema = z
  .array(artifactGroundingRefSchema)
  .max(32)
  .superRefine((refs, context) => {
    if (new Set(refs).size !== refs.length) {
      context.addIssue({ code: "custom", message: "Grounding refs must be unique" });
    }
  });
