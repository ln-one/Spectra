import { API_BASE_URL, apiFetch, shouldSkipAuth } from "@/lib/sdk/client";
import { TokenStorage } from "@/lib/auth";

const originalFetch = global.fetch;

describe("sdk client auth skipping", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  test("keeps auth enabled for /api/v1/auth/me", () => {
    expect(shouldSkipAuth("/api/v1/auth/me")).toBe(false);
  });

  test("keeps auth enabled for /api/v1/auth/logout", () => {
    expect(shouldSkipAuth("/api/v1/auth/logout")).toBe(false);
  });

  test("skips auth only for login register and refresh", () => {
    expect(shouldSkipAuth("/api/v1/auth/login")).toBe(true);
    expect(shouldSkipAuth("/api/v1/auth/register")).toBe(true);
    expect(shouldSkipAuth("/api/v1/auth/refresh")).toBe(true);
  });

  test("resolves a valid API base URL when env is not set", () => {
    expect(API_BASE_URL).toMatch(/^https?:\/\//);
  });

  test("refreshes access token before protected request when only refresh token exists", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      if (request.url.endsWith("/api/v1/auth/refresh")) {
        return new Response(
          JSON.stringify({
            data: {
              access_token: "fresh-token",
              refresh_token: "refresh-token",
              expires_in: 3600,
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      expect(request.headers.get("Authorization")).toBe("Bearer fresh-token");
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    global.fetch = fetchMock as typeof fetch;
    jest
      .spyOn(TokenStorage, "getAccessToken")
      .mockReturnValueOnce(null)
      .mockReturnValueOnce("fresh-token");
    jest
      .spyOn(TokenStorage, "getRefreshToken")
      .mockReturnValue("refresh-token");
    jest.spyOn(TokenStorage, "setAccessToken").mockImplementation(() => {});
    jest.spyOn(TokenStorage, "setRefreshToken").mockImplementation(() => {});
    jest.spyOn(TokenStorage, "clearTokens").mockImplementation(() => {});

    await apiFetch("/api/v1/generate/sessions/demo/preview");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
