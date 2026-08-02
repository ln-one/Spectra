import OpenAI from "openai";
import { z } from "zod";
import type { EmbeddingPort, RerankPort } from "./ports";

export function createBailianEmbeddingPort(config: {
  apiKey: string;
  baseUrl: string;
  model: string;
  dimension: number;
  transport?: {
    create(
      input: {
        model: string;
        input: string[];
        dimensions: number;
        encoding_format: "float";
      },
      signal?: AbortSignal,
    ): Promise<unknown>;
  };
}): EmbeddingPort {
  const transport =
    config.transport ??
    (() => {
      const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl, maxRetries: 0 });
      return {
        create: (input: Parameters<typeof client.embeddings.create>[0], signal?: AbortSignal) =>
          client.embeddings.create(input, signal ? { signal } : undefined),
      };
    })();
  return {
    async embed(texts, signal) {
      if (texts.length === 0) return [];
      let response: unknown;
      try {
        response = await transport.create(
          {
            model: config.model,
            input: [...texts],
            dimensions: config.dimension,
            encoding_format: "float",
          },
          signal,
        );
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        throw new Error("knowledge_embedding_unavailable", { cause: error });
      }
      const parsed = z
        .object({
          data: z.array(
            z.object({ index: z.int().nonnegative(), embedding: z.array(z.number().finite()) }),
          ),
        })
        .passthrough()
        .parse(response);
      if (parsed.data.length !== texts.length) throw new Error("knowledge_embedding_shape");
      const ordered = [...parsed.data].sort((left, right) => left.index - right.index);
      return ordered.map((item, index) => {
        if (
          item.index !== index ||
          item.embedding.length !== config.dimension ||
          item.embedding.some((value) => !Number.isFinite(value))
        ) {
          throw new Error("knowledge_embedding_invalid");
        }
        return item.embedding;
      });
    },
  };
}

const rerankResponseSchema = z
  .object({
    output: z
      .object({
        results: z.array(
          z
            .object({ index: z.int().nonnegative(), relevance_score: z.number().finite() })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();

export function createBailianRerankPort(config: {
  apiKey: string;
  url: string;
  model: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}): RerankPort {
  const fetchImplementation = config.fetch ?? fetch;
  return {
    async rerank(input) {
      if (input.documents.length === 0) return [];
      const timeout = AbortSignal.timeout(config.timeoutMs);
      const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
      const response = await fetchImplementation(config.url, {
        method: "POST",
        headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          input: {
            query: input.query,
            documents: input.documents.map((document) => document.text),
          },
          parameters: {
            return_documents: false,
            top_n: input.documents.length,
            instruct: "Given a question, retrieve passages that answer the question",
          },
        }),
        signal,
      });
      if (!response.ok) throw new Error(`knowledge_rerank_${response.status}`);
      const parsed = rerankResponseSchema.parse(await response.json());
      if (parsed.output.results.length !== input.documents.length)
        throw new Error("knowledge_rerank_shape");
      const seen = new Set<number>();
      return parsed.output.results.map((result) => {
        if (result.index >= input.documents.length || seen.has(result.index))
          throw new Error("knowledge_rerank_shape");
        seen.add(result.index);
        const document = input.documents[result.index];
        if (!document) throw new Error("knowledge_rerank_shape");
        return { id: document.id, score: result.relevance_score };
      });
    },
  };
}
