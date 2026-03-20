import { ApiError } from "@/lib/sdk/client";
import { studioCardsApi } from "@/lib/sdk/studio-cards";

describe("studio cards sdk", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test("gets execution plan with typed readiness", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          message: "ok",
          data: {
            execution_plan: {
              card_id: "interactive_games",
              readiness: "foundation_ready",
              initial_binding: {
                endpoint:
                  "/api/v1/generate/studio-cards/interactive_games/execute",
                command: "execute",
              },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    global.fetch = fetchMock as typeof global.fetch;

    const result = await studioCardsApi.getExecutionPlan("interactive_games");
    expect(result.data.execution_plan.readiness).toBe("foundation_ready");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.url).toContain(
      "/api/v1/generate/studio-cards/interactive_games/execution-plan"
    );
  });

  test("throws ApiError when execute returns non-2xx", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "CARD_NOT_READY",
            message: "card not ready",
          },
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      )
    );
    global.fetch = fetchMock as typeof global.fetch;

    await expect(
      studioCardsApi.execute("word_document", { project_id: "proj_1" })
    ).rejects.toBeInstanceOf(ApiError);
  });
});
