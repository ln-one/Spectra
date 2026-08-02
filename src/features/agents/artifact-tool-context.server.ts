import type { TracingContext } from "@mastra/core/observability";
import type { RequestContext } from "@mastra/core/request-context";
import {
  type WorkspaceAgentToolContext,
  workspaceAgentToolContextSchema,
} from "./workspace-agent-tool-context";

export type ArtifactToolContext = {
  requestContext?: RequestContext<WorkspaceAgentToolContext>;
  tracingContext?: TracingContext;
  writer?: {
    custom: (data: {
      data: unknown;
      id?: string;
      transient?: boolean;
      type: `data-${string}`;
    }) => Promise<void>;
  };
};

export function artifactToolScope(context: ArtifactToolContext | undefined) {
  if (!context?.requestContext) throw new Error("workspace_agent_context_missing");
  return workspaceAgentToolContextSchema.parse(context.requestContext.all);
}
