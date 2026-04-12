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

  it("returns a slow-response notice only when duration is high enough", () => {
    const { getChatLatencyNotice } = require("@/lib/sdk/errors");

    expect(getChatLatencyNotice({ total_duration_ms: 22000 })).toContain(
      "22 秒"
    );
    expect(getChatLatencyNotice({ total_duration_ms: 9000 })).toBeNull();
  });
});
