import { z } from "zod";

const queryResponseSchema = z
  .object({
    result: z.object({
      points: z.array(
        z
          .object({
            id: z.union([z.string(), z.number()]),
            score: z.number().finite(),
          })
          .passthrough(),
      ),
    }),
    status: z.literal("ok"),
  })
  .passthrough();

export type OracleRankedPoint = { id: string; rank: number; score: number };

export function exhaustiveWrrf(input: {
  dense: readonly OracleRankedPoint[];
  sparse: readonly OracleRankedPoint[];
  k: number;
  weights: readonly [number, number];
  limit: number;
}) {
  const scores = new Map<string, number>();
  for (const [points, weight] of [
    [input.dense, input.weights[0]],
    [input.sparse, input.weights[1]],
  ] as const) {
    for (const point of points) {
      scores.set(point.id, (scores.get(point.id) ?? 0) + weight / (input.k + point.rank));
    }
  }
  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, input.limit)
    .map((point, index) => ({ ...point, rank: index + 1 }));
}

function normalizeChannel(points: Array<{ id: string | number; score: number }>) {
  return points
    .map((point) => ({ id: String(point.id), score: point.score }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .map((point, index) => ({ ...point, rank: index + 1 }));
}

async function queryChannel(input: {
  url: string;
  collection: string;
  query: unknown;
  using: "dense" | "sparse";
  workspaceId: string;
  manifestHash: string;
  limit: number;
  signal?: AbortSignal;
}) {
  const response = await fetch(
    `${input.url}/collections/${encodeURIComponent(input.collection)}/points/query`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: input.query,
        using: input.using,
        limit: input.limit,
        params: { exact: true },
        with_payload: false,
        filter: {
          must: [
            { key: "workspaceId", match: { value: input.workspaceId } },
            { key: "manifestHash", match: { value: input.manifestHash } },
            { key: "indexState", match: { value: "live" } },
          ],
        },
      }),
      ...(input.signal ? { signal: input.signal } : {}),
    },
  );
  if (!response.ok)
    throw new Error(`knowledge_acceptance_oracle_${input.using}_${response.status}`);
  return normalizeChannel(queryResponseSchema.parse(await response.json()).result.points);
}

export async function exhaustiveOracle(input: {
  url: string;
  collection: string;
  dense: number[];
  sparseText: string;
  workspaceId: string;
  manifestHash: string;
  corpusSize: number;
  k: number;
  weights: [number, number];
  limit: number;
  signal?: AbortSignal;
}) {
  const [dense, sparse] = await Promise.all([
    queryChannel({
      ...input,
      query: input.dense,
      using: "dense",
      limit: input.corpusSize,
    }),
    queryChannel({
      ...input,
      query: { text: input.sparseText, model: "qdrant/bm25" },
      using: "sparse",
      limit: input.corpusSize,
    }),
  ]);
  return {
    dense,
    sparse,
    fused: exhaustiveWrrf({
      dense,
      sparse,
      k: input.k,
      weights: input.weights,
      limit: input.limit,
    }),
  };
}
