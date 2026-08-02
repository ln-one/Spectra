import { z } from "zod";
import { searchWorkspaceKnowledge } from "@/features/knowledge";

const input = z
  .object({
    principalId: z.uuid(),
    handle: z.string().min(1),
    workspaceId: z.uuid(),
    query: z.string().min(1),
  })
  .parse({
    principalId: process.env.KNOWLEDGE_LIVE_PRINCIPAL_ID,
    handle: process.env.KNOWLEDGE_LIVE_HANDLE,
    workspaceId: process.env.KNOWLEDGE_LIVE_WORKSPACE_ID,
    query: process.env.KNOWLEDGE_LIVE_QUERY,
  });

const result = await searchWorkspaceKnowledge({
  actor: { principalId: input.principalId, handle: input.handle },
  workspaceId: input.workspaceId,
  query: input.query,
});

console.log(
  JSON.stringify(
    {
      status: result.status,
      candidateCount: result.candidates.length,
      evidenceCount: result.evidence.length,
      degradedReasons: result.degradedReasons,
      guarantee: result.guarantee,
    },
    null,
    2,
  ),
);
