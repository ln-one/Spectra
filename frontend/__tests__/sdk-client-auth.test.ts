import { apiFetch, shouldSkipAuth } from "@/lib/sdk/client";

const originalFetch = global.fetch;

describe("sdk client cookie auth", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  test("keeps auth enabled for /api/v1/auth/me", () => {
    expect(shouldSkipAuth("/api/v1/auth/me")).toBe(false);
  });

  test("skips auth only for login and register", () => {
    expect(shouldSkipAuth("/api/v1/auth/login")).toBe(true);
    expect(shouldSkipAuth("/api/v1/auth/register")).toBe(true);
  });

  test("sends protected requests with credentials include and no bearer header", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      expect(request.credentials).toBe("include");
      expect(request.headers.get("Authorization")).toBeNull();
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    global.fetch = fetchMock as typeof fetch;

    await apiFetch("/api/v1/generate/sessions/demo/preview");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
