import { previewApi } from "@/lib/sdk/preview";
import { ragApi } from "@/lib/sdk/rag";
import { apiFetch, sdkClient } from "@/lib/sdk/client";

jest.mock("@/lib/sdk/client", () => {
  const POST = jest.fn();
  const GET = jest.fn();
  const apiFetch = jest.fn();
  class ApiError extends Error {
    code: string;
    status?: number;
    constructor(code: string, message: string, status?: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }

  return {
    sdkClient: {
      POST,
      GET,
    },
    apiFetch,
    ApiError,
    unwrap: jest.fn(async (result: { data?: unknown }) => result.data),
    withIdempotency: jest.fn(() => ({})),
  };
});

describe("sdk query passthrough", () => {
  const mockedPost = sdkClient.POST as jest.Mock;
  const mockedGet = sdkClient.GET as jest.Mock;
  const mockedApiFetch = apiFetch as jest.Mock;

  beforeEach(() => {
    mockedPost.mockReset();
    mockedGet.mockReset();
    mockedApiFetch.mockReset();
  });

  it("passes webSearch query params by contract", async () => {
    mockedPost.mockResolvedValue({
      data: {
        success: true,
        data: { total: 3, indexed: 2, results: [] },
        message: "ok",
      },
    });

    await ragApi.webSearch({
      query: "next.js ai",
      project_id: "proj_1",
      max_results: 5,
      auto_index: true,
    });

    expect(mockedPost).toHaveBeenCalledWith("/api/v1/rag/web-search", {
      params: {
        query: {
          query: "next.js ai",
          project_id: "proj_1",
          max_results: 5,
          auto_index: true,
        },
      },
    });
  });

  it("passes artifact_id and run_id to getSessionPreview", async () => {
    mockedGet.mockResolvedValue({
      data: { success: true, data: { session_id: "sess_1", slides: [] } },
    });

    await previewApi.getSessionPreview("sess_1", {
      artifact_id: "art_1",
      run_id: "run_1",
    });

    expect(mockedGet).toHaveBeenCalledWith(
      "/api/v1/generate/sessions/{session_id}/preview",
      {
        params: {
          path: { session_id: "sess_1" },
          query: { artifact_id: "art_1", run_id: "run_1" },
        },
      }
    );
  });

  it("passes artifact_id and run_id to getSessionSlideDetail", async () => {
    mockedGet.mockResolvedValue({
      data: { success: true, data: { slide: null } },
    });

    await previewApi.getSessionSlideDetail("sess_1", "slide_2", {
      artifact_id: "art_2",
      run_id: "run_2",
    });

    expect(mockedGet).toHaveBeenCalledWith(
      "/api/v1/generate/sessions/{session_id}/preview/slides/{slide_id}",
      {
        params: {
          path: { session_id: "sess_1", slide_id: "slide_2" },
          query: { artifact_id: "art_2", run_id: "run_2" },
        },
      }
    );
  });

  it("passes modify request body by contract", async () => {
    mockedPost.mockResolvedValue({
      data: { success: true, data: { session_id: "sess_1" } },
    });

    await previewApi.modifySessionPreview("sess_1", {
      artifact_id: "art_3",
      run_id: "run_3",
      instruction: "调整当前页标题",
      slide_id: "slide_3",
      slide_index: 3,
      scope: "current_slide_only",
      preserve_style: true,
      preserve_layout: true,
      preserve_deck_consistency: true,
      patch: {
        schema_version: 1,
        operations: [{ op: "replace_text", path: "/title" }],
      },
    });

    expect(mockedPost).toHaveBeenCalledWith(
      "/api/v1/generate/sessions/{session_id}/preview/modify",
      {
        params: { path: { session_id: "sess_1" } },
        body: {
          artifact_id: "art_3",
          run_id: "run_3",
          instruction: "调整当前页标题",
          slide_id: "slide_3",
          slide_index: 3,
          scope: "current_slide_only",
          preserve_style: true,
          preserve_layout: true,
          preserve_deck_consistency: true,
          patch: {
            schema_version: 1,
            operations: [{ op: "replace_text", path: "/title" }],
          },
        },
        headers: {},
      }
    );
  });

  it("passes export request body by contract", async () => {
    mockedPost.mockResolvedValue({
      data: { success: true, data: { content: "# Demo" } },
    });

    await previewApi.exportSessionPreview("sess_1", {
      artifact_id: "art_4",
      run_id: "run_4",
      format: "html",
      include_sources: false,
    });

    expect(mockedPost).toHaveBeenCalledWith(
      "/api/v1/generate/sessions/{session_id}/preview/export",
      {
        params: { path: { session_id: "sess_1" } },
        body: {
          artifact_id: "art_4",
          run_id: "run_4",
          format: "html",
          include_sources: false,
        },
      }
    );
  });

  it("loads slide scene with run query params", async () => {
    mockedApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { slide_id: "slide-1", nodes: [] } }),
    });

    await previewApi.getSessionSlideScene("sess_1", "slide-1", {
      run_id: "run_1",
      artifact_id: "art_1",
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/v1/generate/sessions/sess_1/preview/slides/slide-1/scene?artifact_id=art_1&run_id=run_1",
      undefined
    );
  });

  it("saves slide scene with explicit operations", async () => {
    mockedApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { slide_id: "slide-1", scene: { nodes: [] } } }),
    });

    await previewApi.saveSessionSlideScene(
      "sess_1",
      "slide-1",
      {
        scene_version: "scene-v1",
        operations: [{ op: "replace_text", node_id: "text:config:title", value: "New title" }],
      },
      { run_id: "run_1" }
    );

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/v1/generate/sessions/sess_1/preview/slides/slide-1/scene/save?run_id=run_1",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene_version: "scene-v1",
          operations: [{ op: "replace_text", node_id: "text:config:title", value: "New title" }],
        }),
      }
    );
  });
});
