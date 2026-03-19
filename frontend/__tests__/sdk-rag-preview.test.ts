import { previewApi } from "@/lib/sdk/preview";
import { ragApi } from "@/lib/sdk/rag";
import { sdkClient } from "@/lib/sdk/client";

jest.mock("@/lib/sdk/client", () => {
  const POST = jest.fn();
  const GET = jest.fn();

  return {
    sdkClient: {
      POST,
      GET,
    },
    unwrap: jest.fn(async (result: { data?: unknown }) => result.data),
    withIdempotency: jest.fn(() => ({})),
  };
});

describe("sdk query passthrough", () => {
  const mockedPost = sdkClient.POST as jest.Mock;
  const mockedGet = sdkClient.GET as jest.Mock;

  beforeEach(() => {
    mockedPost.mockReset();
    mockedGet.mockReset();
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

  it("passes artifact_id to getSessionPreview", async () => {
    mockedGet.mockResolvedValue({
      data: { success: true, data: { session_id: "sess_1", slides: [] } },
    });

    await previewApi.getSessionPreview("sess_1", { artifact_id: "art_1" });

    expect(mockedGet).toHaveBeenCalledWith(
      "/api/v1/generate/sessions/{session_id}/preview",
      {
        params: {
          path: { session_id: "sess_1" },
          query: { artifact_id: "art_1" },
        },
      }
    );
  });

  it("passes artifact_id to getSessionSlideDetail", async () => {
    mockedGet.mockResolvedValue({
      data: { success: true, data: { slide: null } },
    });

    await previewApi.getSessionSlideDetail("sess_1", "slide_2", {
      artifact_id: "art_2",
    });

    expect(mockedGet).toHaveBeenCalledWith(
      "/api/v1/generate/sessions/{session_id}/preview/slides/{slide_id}",
      {
        params: {
          path: { session_id: "sess_1", slide_id: "slide_2" },
          query: { artifact_id: "art_2" },
        },
      }
    );
  });
});
