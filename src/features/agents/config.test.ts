import { isProviderDefinedTool } from "@mastra/core/tools";
import { generateText, Output } from "ai";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { dashScopeEnvironment, dashScopeModels } from "@/ai/dashscope";
import { testServerEnvironment } from "@/environment/test";
import {
  createThreadTitleModel,
  createWorkspaceAgentResources,
  threadTitleProfile,
  workspaceAgentProfile,
} from "./config";

describe("DashScope configuration", () => {
  test("parses the server environment at one boundary", () => {
    expect(
      dashScopeEnvironment(
        testServerEnvironment({
          DASHSCOPE_API_KEY: "test-key",
          DASHSCOPE_BASE_URL: "https://example.invalid/compatible-mode/v1",
        }),
      ),
    ).toEqual({
      apiKey: "test-key",
      baseURL: "https://example.invalid/compatible-mode/v1",
    });
  });

  test("rejects missing credentials and insecure endpoints", () => {
    expect(() => dashScopeEnvironment(testServerEnvironment())).toThrow();
    expect(() =>
      dashScopeEnvironment(
        testServerEnvironment({
          DASHSCOPE_API_KEY: "test-key",
          DASHSCOPE_BASE_URL: "http://example.invalid/compatible-mode/v1",
        }),
      ),
    ).toThrow("Invalid environment variables");
  });

  test("keeps the workspace model profile explicit", () => {
    expect(dashScopeModels).toEqual({
      artifactGeneration: "qwen3.7-plus",
      artifactSuggestion: "qwen3.6-flash-2026-04-16",
      mediaUnderstanding: "qwen3.5-omni-flash-2026-03-15",
      threadTitle: "qwen3.6-flash-2026-04-16",
      workspaceAgent: "qwen3.7-plus",
    });
    expect(workspaceAgentProfile).toEqual({
      budget: {
        maxCostMicrousd: 500_000,
        maxInputTokens: 80_000,
        maxOutputTokens: 20_512,
        maxProviderCalls: 6,
        maxToolCalls: 6,
        maxTotalTokens: 100_512,
        wallTimeMs: 150_000,
      },
      historyCandidateMessages: 40,
      maxOutputTokens: 4096,
      maxSteps: 7,
      modelContextLastTurns: 8,
      modelContextMaxTokens: 48_000,
      modelId: "qwen3.7-plus",
      providerOptions: {
        openai: {
          maxToolCalls: 1,
          parallelToolCalls: false,
        },
      },
      temperature: 0,
    });

    const resources = createWorkspaceAgentResources(
      testServerEnvironment({
        DASHSCOPE_API_KEY: "test-key",
        DASHSCOPE_BASE_URL: "https://example.invalid/compatible-mode/v1",
      }),
    );
    expect(resources.model.modelId).toBe("qwen3.7-plus");
    expect(resources.model.provider).toBe("openai.responses");
    expect(isProviderDefinedTool(resources.webSearch)).toBe(true);
  });

  test("serializes workspace images only as Responses user input", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetchMock: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({
        created_at: 1,
        id: "resp-visual",
        model: workspaceAgentProfile.modelId,
        output: [
          {
            id: "msg-visual",
            role: "assistant",
            type: "message",
            content: [{ annotations: [], text: "Visual answer", type: "output_text" }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 2 },
      });
    };
    const resources = createWorkspaceAgentResources(
      testServerEnvironment({
        DASHSCOPE_API_KEY: "test-key",
        DASHSCOPE_BASE_URL: "https://example.invalid/compatible-mode/v1",
      }),
      fetchMock,
    );

    await generateText({
      model: resources.model,
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call-search-1",
              toolName: "search_workspace",
              input: { denseQuery: "rollback diagram" },
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call-search-1",
              toolName: "search_workspace",
              output: { type: "text", value: '{"evidence":[{"citation":"[1](#trusted)"}]}' },
            },
          ],
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Inspect the candidate." },
            { type: "image", image: new Uint8Array([1, 2, 3]), mediaType: "image/webp" },
          ],
        },
      ],
    });

    expect(requestBody).toMatchObject({
      input: [
        {
          arguments: '{"denseQuery":"rollback diagram"}',
          call_id: "call-search-1",
          name: "search_workspace",
          type: "function_call",
        },
        {
          call_id: "call-search-1",
          output: '{"evidence":[{"citation":"[1](#trusted)"}]}',
          type: "function_call_output",
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: "Inspect the candidate." },
            {
              type: "input_image",
              image_url: "data:image/webp;base64,AQID",
            },
          ],
        },
      ],
    });
    const serialized = JSON.stringify(requestBody);
    expect(serialized.match(/AQID/g)).toHaveLength(1);
    expect(serialized).not.toContain('"output":{"type":"text"');
  });

  test("keeps the fixed non-thinking title profile explicit", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetchMock: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            message: { content: '{"title":"TCP/IP 课堂讲解"}', role: "assistant" },
          },
        ],
        created: 1,
        id: "chatcmpl-title",
        model: threadTitleProfile.modelId,
        object: "chat.completion",
        usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15 },
      });
    };
    const model = createThreadTitleModel(
      testServerEnvironment({
        DASHSCOPE_API_KEY: "test-key",
        DASHSCOPE_BASE_URL: "https://example.invalid/compatible-mode/v1",
      }),
      fetchMock,
    );
    const { output } = await generateText({
      maxOutputTokens: threadTitleProfile.maxOutputTokens,
      model,
      output: Output.object({ schema: z.object({ title: z.string() }).strict() }),
      prompt: "Return a JSON title.",
    });

    expect(output).toEqual({ title: "TCP/IP 课堂讲解" });
    expect(threadTitleProfile).toEqual({
      inputCharacterLimit: 1200,
      maxOutputTokens: 32,
      modelId: "qwen3.6-flash-2026-04-16",
      temperature: 0,
      timeoutMs: 8_000,
    });
    expect(requestBody).toMatchObject({
      enable_thinking: false,
      max_tokens: 32,
      model: "qwen3.6-flash-2026-04-16",
      response_format: { type: "json_schema" },
    });
  });
});
