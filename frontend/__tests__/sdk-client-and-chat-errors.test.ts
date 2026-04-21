describe("sdk client api base url resolution", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it("uses NEXT_PUBLIC_API_URL in the browser runtime", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.browser.example/";
    process.env.INTERNAL_API_URL = "http://internal.example:8000/";

    jest.isolateModules(() => {
      const { resolveApiBaseUrl } = require("@/lib/sdk/client");
      expect(resolveApiBaseUrl("browser")).toBe("https://api.browser.example");
    });
  });

  it("prefers INTERNAL_API_URL on the server runtime", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.public.example/";
    process.env.INTERNAL_API_URL = "http://backend.internal:8000/";

    jest.isolateModules(() => {
      const { resolveApiBaseUrl } = require("@/lib/sdk/client");
      expect(resolveApiBaseUrl("server")).toBe("http://backend.internal:8000");
    });
  });

  it("uses the studio generation timeout for long-running studio POST requests", async () => {
    process.env.NEXT_PUBLIC_API_TIMEOUT_MS = "30000";
    process.env.NEXT_PUBLIC_STUDIO_GENERATION_TIMEOUT_MS = "600000";
    jest.useFakeTimers();

    const fetchMock = jest.fn(
      (request: Request) =>
        new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true }
          );
        })
    );
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof global.fetch;

    try {
      jest.resetModules();
      const { apiFetch } = await import("@/lib/sdk/client");
      const requestPromise = apiFetch(
        "/api/v1/generate/studio-cards/word_document/execute",
        {
          method: "POST",
          body: JSON.stringify({ project_id: "proj_1" }),
        }
      );
      const resultPromise = requestPromise.catch((error) => error);

      await jest.advanceTimersByTimeAsync(30000);
      await Promise.resolve();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(570000);
      await expect(resultPromise).resolves.toMatchObject({
        code: "NETWORK_TIMEOUT",
        details: expect.objectContaining({ timeout_ms: 600000 }),
      });
    } finally {
      global.fetch = originalFetch;
      jest.useRealTimers();
    }
  });

  it("uses the word-specific studio timeout when configured", async () => {
    process.env.NEXT_PUBLIC_API_TIMEOUT_MS = "30000";
    process.env.NEXT_PUBLIC_STUDIO_GENERATION_TIMEOUT_MS = "600000";
    process.env.NEXT_PUBLIC_STUDIO_WORD_GENERATION_TIMEOUT_MS = "900000";
    jest.useFakeTimers();

    const fetchMock = jest.fn(
      (request: Request) =>
        new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true }
          );
        })
    );
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof global.fetch;

    try {
      jest.resetModules();
      const { apiFetch } = await import("@/lib/sdk/client");
      const requestPromise = apiFetch(
        "/api/v1/generate/studio-cards/word_document/execute",
        {
          method: "POST",
          body: JSON.stringify({ project_id: "proj_1" }),
        }
      );
      const resultPromise = requestPromise.catch((error) => error);

      await jest.advanceTimersByTimeAsync(600000);
      await Promise.resolve();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(300000);
      await expect(resultPromise).resolves.toMatchObject({
        code: "NETWORK_TIMEOUT",
        details: expect.objectContaining({ timeout_ms: 900000 }),
      });
    } finally {
      global.fetch = originalFetch;
      jest.useRealTimers();
    }
  });
});

describe("chat error helpers", () => {
  it("maps network timeouts to a chat-specific message", () => {
    const {
      ApiError,
      getChatRequestErrorMessage,
    } = require("@/lib/sdk/errors");
    const error = new ApiError("NETWORK_TIMEOUT", "timeout");

    expect(getChatRequestErrorMessage(error)).toContain("聊天请求超时");
  });

  it("maps proxy resets to a connection-specific message", () => {
    const {
      ApiError,
      getChatRequestErrorMessage,
    } = require("@/lib/sdk/errors");
    const error = new ApiError("NETWORK_ERROR", "network", undefined, {
      cause: "socket hang up ECONNRESET",
    });

    expect(getChatRequestErrorMessage(error)).toContain("聊天连接被中途断开");
  });
});
