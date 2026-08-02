import type { AnySpan } from "@mastra/core/observability";
import { describe, expect, it } from "vitest";
import { testServerEnvironment } from "@/environment/test";
import {
  createAgentObservabilityResources,
  redactAgentTraceAttributes,
  redactAgentTraceContent,
  SpectraContentPrivacyProcessor,
} from "./observability.server";

describe("Mastra observability privacy boundary", () => {
  it("does not fall back to the product database in production", () => {
    expect(
      createAgentObservabilityResources(
        testServerEnvironment({
          DATABASE_URL: "postgres://product",
          NODE_ENV: "production",
        }),
      ),
    ).toEqual({});
  });

  it("redacts message, prompt, tool argument, result, input, and output content", () => {
    expect(
      redactAgentTraceContent({
        safe: "create_teaching_document",
        nested: {
          messages: ["secret"],
          prompt: "secret",
          toolArgs: { topic: "secret" },
          toolResult: { markdown: "secret" },
        },
      }),
    ).toEqual({
      nested: {
        messages: "[REDACTED]",
        prompt: "[REDACTED]",
        toolArgs: "[REDACTED]",
        toolResult: "[REDACTED]",
      },
      safe: "create_teaching_document",
    });
  });

  it("redacts AI SDK dotted prompt, response, and tool payload attributes", () => {
    expect(
      redactAgentTraceContent({
        "ai.prompt": "secret prompt",
        "ai.prompt.messages": ["secret message"],
        "ai.response.object": { document: "secret" },
        "ai.response.reasoning": "secret reasoning",
        "ai.response.text": "secret response",
        "ai.response.toolCalls": [{ args: { prompt: "secret" } }],
        "ai.response.model": "qwen",
        "ai.toolCall.args": { prompt: "secret args" },
        "ai.toolCall.result": { markdown: "secret result" },
        "gen_ai.usage.input_tokens": 12,
      }),
    ).toEqual({
      "ai.prompt": "[REDACTED]",
      "ai.prompt.messages": "[REDACTED]",
      "ai.response.object": "[REDACTED]",
      "ai.response.reasoning": "[REDACTED]",
      "ai.response.text": "[REDACTED]",
      "ai.response.toolCalls": "[REDACTED]",
      "ai.response.model": "qwen",
      "ai.toolCall.args": "[REDACTED]",
      "ai.toolCall.result": "[REDACTED]",
      "gen_ai.usage.input_tokens": 12,
    });
  });

  it("keeps only diagnostic trace attributes and redacts unknown fields by default", () => {
    expect(
      redactAgentTraceAttributes({
        "ai.response.modelId": "qwen",
        "ai.response.toolCalls": [{ args: "secret" }],
        "gen_ai.usage.output_tokens": 24,
        customPayload: "secret",
        rootRunId: "run-id",
        toolName: "create_mind_map",
      }),
    ).toEqual({
      "ai.response.modelId": "qwen",
      "ai.response.toolCalls": "[REDACTED]",
      "gen_ai.usage.output_tokens": 24,
      customPayload: "[REDACTED]",
      rootRunId: "run-id",
      toolName: "create_mind_map",
    });
  });

  it("preserves the live Mastra span instance while redacting its content", () => {
    const span = {
      attributes: { modelId: "qwen", prompt: "secret" },
      exportSpan: () => ({ id: "exported" }),
      input: "secret input",
      metadata: { secret: "metadata" },
      output: "secret output",
    } as unknown as AnySpan;

    const processed = new SpectraContentPrivacyProcessor().process(span);

    expect(processed).toBe(span);
    expect(processed.exportSpan()).toEqual({ id: "exported" });
    expect(processed.input).toBe("[REDACTED]");
    expect(processed.output).toBe("[REDACTED]");
    expect(processed.metadata).toEqual({ privacy: "[REDACTED]" });
  });

  it("keeps only allowlisted diagnostics for the Knowledge search event", () => {
    const span = {
      name: "knowledge.search.result",
      output: {
        cacheHit: false,
        candidateCount: 8,
        newEvidenceCount: 2,
        query: "secret query",
        round: 2,
        status: "degraded",
        stopReason: "continue",
      },
    } as unknown as AnySpan;

    const processed = new SpectraContentPrivacyProcessor().process(span);

    expect(processed.output).toEqual({
      cacheHit: false,
      candidateCount: 8,
      newEvidenceCount: 2,
      query: "[REDACTED]",
      round: 2,
      status: "degraded",
      stopReason: "continue",
    });
  });

  it("rejects an observability URL that resolves to the product database", () => {
    expect(() =>
      createAgentObservabilityResources(
        testServerEnvironment({
          DATABASE_URL:
            "postgres://product:secret@db.internal:5432/spectra?application_name=product",
          MASTRA_OBSERVABILITY_DATABASE_URL:
            "postgresql://observer:other@DB.INTERNAL/spectra?application_name=traces",
          NODE_ENV: "production",
        }),
      ),
    ).toThrow("must use a separate database");
  });
});
