import { z } from "zod";
import type { ExactRrfPort } from "./ports";

const responseSchema = z
  .object({
    result: z
      .object({
        points: z.array(
          z
            .object({
              id: z.union([z.string(), z.number()]),
              rank: z.int().positive(),
              version: z.int().nonnegative(),
            })
            .strict(),
        ),
        guarantee: z
          .object({
            scope: z.string(),
            orderedTopKExact: z.literal(true),
            tieBreak: z.literal("point-identity-ascending"),
            channelInput: z.string(),
          })
          .strict(),
        execution: z.unknown().optional(),
      })
      .strict(),
    status: z.literal("ok"),
    time: z.number().nonnegative().optional(),
  })
  .strict();

export function createStratumindExactRrfPort(config: {
  url: string;
  apiKey?: string;
  fetch?: typeof fetch;
}): ExactRrfPort {
  const fetchImplementation = config.fetch ?? fetch;
  return {
    async query(input) {
      let response: Response;
      try {
        response = await fetchImplementation(
          `${config.url}/collections/${encodeURIComponent(input.collection)}/points/query/exact-rrf`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(config.apiKey ? { "api-key": config.apiKey } : {}),
            },
            body: JSON.stringify({
              exact_rrf: {
                dense: { query: input.dense, using: "dense" },
                sparse: {
                  query: { text: input.sparseText, model: "qdrant/bm25" },
                  using: "sparse",
                },
                k: input.k,
                weights: input.weights,
              },
              limit: input.limit,
              filter: {
                must: [
                  { key: "workspaceId", match: { any: input.workspaceIds } },
                  { key: "manifestHash", match: { value: input.manifestHash } },
                  { key: "generationId", match: { any: input.generationIds } },
                  { key: "indexState", match: { value: "live" } },
                ],
              },
            }),
            ...(input.signal ? { signal: input.signal } : {}),
          },
        );
      } catch (error) {
        if (input.signal?.aborted) throw input.signal.reason;
        throw new Error("knowledge_stratumind_unavailable", { cause: error });
      }
      if (!response.ok) throw new Error("knowledge_stratumind_unavailable");
      const parsed = responseSchema.parse(await response.json()).result;
      return {
        points: parsed.points.map((point) => ({ ...point, id: String(point.id) })),
        guarantee: parsed.guarantee,
        execution: parsed.execution,
      };
    },
  };
}
