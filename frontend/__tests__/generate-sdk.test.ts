import { generateApi } from "@/lib/sdk/generate";
import { sdkClient } from "@/lib/sdk/client";

jest.mock("@/lib/sdk/client", () => {
  const POST = jest.fn();
  const GET = jest.fn();

  return {
    API_BASE_URL: "http://localhost:8000",
    apiFetch: jest.fn(),
    sdkClient: {
      POST,
      GET,
    },
    toApiError: jest.fn((payload: unknown) => payload),
    unwrap: jest.fn(async (result: { data?: unknown }) => result.data),
    withIdempotency: jest.fn(() => ({ "Idempotency-Key": "idem-test" })),
  };
});

describe("generate sdk createSession compatibility", () => {
  const mockedPost = sdkClient.POST as jest.Mock;
  const mockedGet = sdkClient.GET as jest.Mock;

  beforeEach(() => {
    mockedPost.mockReset();
    mockedGet.mockReset();
  });

  test("injects bootstrap_only=false when omitted", async () => {
    mockedPost.mockResolvedValue({
      data: {
        success: true,
        data: {
          session: { session_id: "sess_1" },
          run: { run_id: "run_1", session_id: "sess_1" },
        },
        message: "ok",
      },
    });

    await generateApi.createSession({
      project_id: "proj_1",
      output_type: "ppt",
    });

    expect(mockedPost).toHaveBeenCalledWith("/api/v1/generate/sessions", {
      body: {
        project_id: "proj_1",
        output_type: "ppt",
        bootstrap_only: false,
      },
      headers: { "Idempotency-Key": "idem-test" },
    });
  });

  test("keeps explicit bootstrap_only value", async () => {
    mockedPost.mockResolvedValue({
      data: {
        success: true,
        data: {
          session: { session_id: "sess_2" },
          run: { run_id: "run_2", session_id: "sess_2" },
        },
        message: "ok",
      },
    });

    await generateApi.createSession({
      project_id: "proj_1",
      output_type: "word",
      bootstrap_only: true,
    });

    expect(mockedPost).toHaveBeenCalledWith("/api/v1/generate/sessions", {
      body: {
        project_id: "proj_1",
        output_type: "word",
        bootstrap_only: true,
      },
      headers: { "Idempotency-Key": "idem-test" },
    });
  });

  test("keeps runtime data.run when backend returns it", async () => {
    mockedPost.mockResolvedValue({
      data: {
        success: true,
        data: {
          session: { session_id: "sess_3" },
          run: { run_id: "run_3", session_id: "sess_3" },
        },
        message: "ok",
      },
    });

    const response = await generateApi.createSession({
      project_id: "proj_1",
      output_type: "ppt",
    });

    expect(response.data.run?.run_id).toBe("run_3");
  });
});
