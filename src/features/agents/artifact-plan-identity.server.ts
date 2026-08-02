import "server-only";

import { v5 as uuidV5 } from "uuid";
import { canonicalJson } from "@/database/canonical-json";
import type { ArtifactPlanItem } from "./artifact-plan-contract";

const ARTIFACT_PLAN_ID_NAMESPACE = "8d3b2b2a-2d9b-4df6-8383-4c39db00a0e6";

export function artifactPlanWorkflowId(input: {
  conversationId: string;
  sourceUserMessageId: string;
  workspaceId: string;
}) {
  return uuidV5(
    canonicalJson([input.workspaceId, input.conversationId, input.sourceUserMessageId]),
    ARTIFACT_PLAN_ID_NAMESPACE,
  );
}

export function artifactPlanItemId(input: {
  index: number;
  item: ArtifactPlanItem;
  sourceUserMessageId: string;
}) {
  return uuidV5(
    canonicalJson([input.sourceUserMessageId, input.index, input.item]),
    ARTIFACT_PLAN_ID_NAMESPACE,
  );
}
