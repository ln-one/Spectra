import { ragApi } from "@/lib/sdk/rag";
import { apiFetch } from "@/lib/sdk/client";

jest.mock("@/lib/sdk/client", () => ({
  apiFetch: jest.fn(),
  sdkClient: {
    POST: jest.fn(),
    GET: jest.fn(),
  },
  unwrap: jest.fn(async (result: { data?: unknown }) => result.data),
}));

describe("ragApi.transcribeAudio", () => {
  const mockedApiFetch = apiFetch as jest.Mock;

  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it("posts form-data with expected fields", async () => {
    mockedApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { text: "hello" } }),
    });

    const file = new File(["voice"], "voice.webm", { type: "audio/webm" });
    await ragApi.transcribeAudio(file, {
      project_id: "proj_1",
      auto_index: false,
      language: "zh",
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockedApiFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/rag/audio-transcribe");
    expect(init.method).toBe("POST");

    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("project_id")).toBe("proj_1");
    expect(body.get("auto_index")).toBe("false");
    expect(body.get("language")).toBe("zh");
    expect(body.get("file")).toBe(file);
  });

  it("uses default language and auto_index", async () => {
    mockedApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { text: "ok" } }),
    });

    const file = new File(["voice"], "voice.webm", { type: "audio/webm" });
    await ragApi.transcribeAudio(file);

    const [, init] = mockedApiFetch.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;
    expect(body.get("auto_index")).toBe("false");
    expect(body.get("language")).toBe("zh");
  });

  it("throws backend message when response is not ok", async () => {
    mockedApiFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ message: "transcribe failed" }),
    });

    const file = new File(["voice"], "voice.webm", { type: "audio/webm" });
    await expect(ragApi.transcribeAudio(file)).rejects.toThrow(
      "transcribe failed"
    );
  });

  it("throws parse error when response json is invalid", async () => {
    mockedApiFetch.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("invalid-json");
      },
    });

    const file = new File(["voice"], "voice.webm", { type: "audio/webm" });
    await expect(ragApi.transcribeAudio(file)).rejects.toThrow();
  });
});
