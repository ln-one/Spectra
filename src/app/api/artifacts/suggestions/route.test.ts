import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueArtifactSuggestions } from "@/features/artifacts/documents/suggestion-dbos";
import {
  artifactSuggestionContextHash,
  markArtifactSuggestionSnapshotRefreshing,
  readArtifactSuggestionSnapshot,
  reserveArtifactSuggestionRequest,
} from "@/features/artifacts/documents/suggestion-snapshots.server";
import { loadArtifactSuggestionContext } from "@/features/artifacts/documents/suggestions";
import { getCurrentActor } from "@/features/identity/current";
import { GET, POST } from "./route";

vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/artifacts/documents/suggestions", () => ({
  loadArtifactSuggestionContext: vi.fn(),
}));
vi.mock("@/features/artifacts/documents/suggestion-snapshots.server", () => ({
  artifactSuggestionContextHash: vi.fn(() => "context-hash"),
  markArtifactSuggestionSnapshotRefreshing: vi.fn(),
  readArtifactSuggestionSnapshot: vi.fn(),
  reserveArtifactSuggestionRequest: vi.fn(),
}));
vi.mock("@/features/artifacts/documents/suggestion-dbos", () => ({
  enqueueArtifactSuggestions: vi.fn(),
}));

const workspaceId = "56a7adf8-9254-4b0f-bd50-2a462470af02";
const suggestions = Array.from({ length: 4 }, (_, index) => ({
  prompt: `Prompt ${index}`,
  title: `Suggestion ${index}`,
}));
const firstGeneration = new Date("2026-07-20T00:00:00.000Z");

beforeEach(() => {
  vi.mocked(getCurrentActor).mockReset().mockResolvedValue({
    handle: "alice",
    principalId: "principal-alice",
  });
  vi.mocked(loadArtifactSuggestionContext).mockReset().mockResolvedValue({
    locale: "zh-CN",
    sourceFingerprint: [],
    sourceNames: [],
    target: "mind_map",
    workspaceId,
    workspaceName: "Course",
    workspaceUpdatedAt: "2026-07-20T00:00:00.000Z",
  });
  vi.mocked(readArtifactSuggestionSnapshot).mockReset();
  vi.mocked(artifactSuggestionContextHash).mockReset().mockReturnValue("context-hash");
  vi.mocked(markArtifactSuggestionSnapshotRefreshing).mockReset().mockResolvedValue(true);
  vi.mocked(reserveArtifactSuggestionRequest)
    .mockReset()
    .mockResolvedValue({ epoch: 7, requestedAt: new Date("2026-07-28T00:00:00.000Z") });
  vi.mocked(enqueueArtifactSuggestions)
    .mockReset()
    .mockResolvedValue(undefined as never);
});

describe("Artifact suggestions API", () => {
  it("returns a fresh target-specific snapshot without queueing", async () => {
    vi.mocked(readArtifactSuggestionSnapshot).mockResolvedValue({
      generatedAt: firstGeneration,
      status: "fresh",
      suggestions,
    });
    const response = await GET(
      new Request(
        `http://localhost/api/artifacts/suggestions?workspaceId=${workspaceId}&locale=zh-CN&target=mind_map`,
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      generation: firstGeneration.toISOString(),
      status: "fresh",
      suggestions,
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(enqueueArtifactSuggestions).not.toHaveBeenCalled();
  });

  it("keeps a stale snapshot visible while rebuilding the same target", async () => {
    vi.mocked(readArtifactSuggestionSnapshot).mockResolvedValue({
      generatedAt: firstGeneration,
      status: "stale",
      suggestions,
    });
    const response = await GET(
      new Request(
        `http://localhost/api/artifacts/suggestions?workspaceId=${workspaceId}&locale=zh-CN&target=mind_map`,
      ),
    );
    expect(await response.json()).toEqual({
      generation: firstGeneration.toISOString(),
      status: "stale",
      suggestions,
    });
    expect(enqueueArtifactSuggestions).toHaveBeenCalledWith(
      workspaceId,
      "zh-CN",
      "mind_map",
      `context:context-hash:generation:${firstGeneration.toISOString()}:epoch:7`,
      "context-hash",
      7,
    );
  });

  it("forces a target-specific refresh without returning fixed fallback cards", async () => {
    vi.mocked(readArtifactSuggestionSnapshot).mockResolvedValue({ status: "missing" });
    const response = await POST(
      new Request("http://localhost/api/artifacts/suggestions", {
        body: JSON.stringify({
          afterGeneration: "missing",
          locale: "zh-CN",
          target: "teaching_document",
          workspaceId,
        }),
        method: "POST",
      }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ generation: null, status: "pending", suggestions: [] });
    expect(enqueueArtifactSuggestions).toHaveBeenCalledWith(
      workspaceId,
      "zh-CN",
      "teaching_document",
      "context:context-hash:generation:missing:epoch:7",
      "context-hash",
      7,
    );
  });

  it("uses a new workflow identity when the suggestion context changes", async () => {
    vi.mocked(readArtifactSuggestionSnapshot).mockResolvedValue({ status: "missing" });
    vi.mocked(artifactSuggestionContextHash)
      .mockReturnValueOnce("first-context")
      .mockReturnValueOnce("second-context");
    const url = `http://localhost/api/artifacts/suggestions?workspaceId=${workspaceId}&locale=zh-CN&target=teaching_document`;

    await GET(new Request(url));
    await GET(new Request(url));

    expect(enqueueArtifactSuggestions).toHaveBeenNthCalledWith(
      1,
      workspaceId,
      "zh-CN",
      "teaching_document",
      "context:first-context:generation:missing:epoch:7",
      "first-context",
      7,
    );
    expect(enqueueArtifactSuggestions).toHaveBeenNthCalledWith(
      2,
      workspaceId,
      "zh-CN",
      "teaching_document",
      "context:second-context:generation:missing:epoch:7",
      "second-context",
      7,
    );
  });

  it("rejects refresh requests without the snapshot generation", async () => {
    const response = await POST(
      new Request("http://localhost/api/artifacts/suggestions", {
        body: JSON.stringify({ locale: "zh-CN", target: "presentation", workspaceId }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    expect(enqueueArtifactSuggestions).not.toHaveBeenCalled();
  });

  it("uses a new database request epoch for each explicit refresh", async () => {
    vi.mocked(readArtifactSuggestionSnapshot).mockResolvedValue({
      generatedAt: firstGeneration,
      status: "fresh",
      suggestions,
    });
    vi.mocked(reserveArtifactSuggestionRequest)
      .mockResolvedValueOnce({
        epoch: 7,
        requestedAt: new Date("2026-07-28T00:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        epoch: 8,
        requestedAt: new Date("2026-07-28T00:00:01.000Z"),
      });

    for (const _request of [1, 2]) {
      await POST(
        new Request("http://localhost/api/artifacts/suggestions", {
          body: JSON.stringify({
            afterGeneration: firstGeneration.toISOString(),
            locale: "zh-CN",
            target: "presentation",
            workspaceId,
          }),
          method: "POST",
        }),
      );
    }

    expect(enqueueArtifactSuggestions).toHaveBeenNthCalledWith(
      1,
      workspaceId,
      "zh-CN",
      "presentation",
      `context:context-hash:generation:${firstGeneration.toISOString()}:epoch:7`,
      "context-hash",
      7,
    );
    expect(enqueueArtifactSuggestions).toHaveBeenNthCalledWith(
      2,
      workspaceId,
      "zh-CN",
      "presentation",
      `context:context-hash:generation:${firstGeneration.toISOString()}:epoch:8`,
      "context-hash",
      8,
    );
  });

  it("does not enqueue a replay after the snapshot generation advances", async () => {
    const secondGeneration = new Date("2026-07-20T00:01:00.000Z");
    vi.mocked(readArtifactSuggestionSnapshot).mockResolvedValue({
      generatedAt: secondGeneration,
      status: "fresh",
      suggestions,
    });

    const response = await POST(
      new Request("http://localhost/api/artifacts/suggestions", {
        body: JSON.stringify({
          afterGeneration: firstGeneration.toISOString(),
          locale: "zh-CN",
          target: "presentation",
          workspaceId,
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      generation: secondGeneration.toISOString(),
      status: "fresh",
      suggestions,
    });
    expect(enqueueArtifactSuggestions).not.toHaveBeenCalled();
  });

  it("does not enqueue when the snapshot advances during refresh reservation", async () => {
    const secondGeneration = new Date("2026-07-20T00:01:00.000Z");
    vi.mocked(markArtifactSuggestionSnapshotRefreshing).mockResolvedValue(false);
    vi.mocked(readArtifactSuggestionSnapshot)
      .mockResolvedValueOnce({
        generatedAt: firstGeneration,
        status: "fresh",
        suggestions,
      })
      .mockResolvedValueOnce({
        generatedAt: secondGeneration,
        status: "fresh",
        suggestions,
      });

    const response = await POST(
      new Request("http://localhost/api/artifacts/suggestions", {
        body: JSON.stringify({
          afterGeneration: firstGeneration.toISOString(),
          locale: "zh-CN",
          target: "presentation",
          workspaceId,
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      generation: secondGeneration.toISOString(),
      status: "fresh",
      suggestions,
    });
    expect(enqueueArtifactSuggestions).not.toHaveBeenCalled();
  });

  it("accepts Quiz as a target and queues only Quiz suggestions", async () => {
    vi.mocked(readArtifactSuggestionSnapshot).mockResolvedValue({ status: "missing" });
    const response = await POST(
      new Request("http://localhost/api/artifacts/suggestions", {
        body: JSON.stringify({
          afterGeneration: "missing",
          locale: "zh-CN",
          target: "quiz",
          workspaceId,
        }),
        method: "POST",
      }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ generation: null, status: "pending", suggestions: [] });
    expect(enqueueArtifactSuggestions).toHaveBeenCalledWith(
      workspaceId,
      "zh-CN",
      "quiz",
      "context:context-hash:generation:missing:epoch:7",
      "context-hash",
      7,
    );
  });

  it("accepts Game as a target and queues only Game suggestions", async () => {
    vi.mocked(readArtifactSuggestionSnapshot).mockResolvedValue({ status: "missing" });
    const response = await POST(
      new Request("http://localhost/api/artifacts/suggestions", {
        body: JSON.stringify({
          afterGeneration: "missing",
          locale: "zh-CN",
          target: "game",
          workspaceId,
        }),
        method: "POST",
      }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ generation: null, status: "pending", suggestions: [] });
    expect(enqueueArtifactSuggestions).toHaveBeenCalledWith(
      workspaceId,
      "zh-CN",
      "game",
      "context:context-hash:generation:missing:epoch:7",
      "context-hash",
      7,
    );
  });

  it("accepts Animation as a target and queues only Animation suggestions", async () => {
    vi.mocked(readArtifactSuggestionSnapshot).mockResolvedValue({ status: "missing" });
    const response = await POST(
      new Request("http://localhost/api/artifacts/suggestions", {
        body: JSON.stringify({
          afterGeneration: "missing",
          locale: "zh-CN",
          target: "animation",
          workspaceId,
        }),
        method: "POST",
      }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ generation: null, status: "pending", suggestions: [] });
    expect(enqueueArtifactSuggestions).toHaveBeenCalledWith(
      workspaceId,
      "zh-CN",
      "animation",
      "context:context-hash:generation:missing:epoch:7",
      "context-hash",
      7,
    );
  });

  it("keeps a forced refresh pending until a newer snapshot is available", async () => {
    const secondGeneration = new Date("2026-07-20T00:01:00.000Z");
    vi.mocked(readArtifactSuggestionSnapshot)
      .mockResolvedValueOnce({
        generatedAt: firstGeneration,
        status: "fresh",
        suggestions,
      })
      .mockResolvedValueOnce({
        generatedAt: firstGeneration,
        status: "fresh",
        suggestions,
      })
      .mockResolvedValueOnce({
        generatedAt: firstGeneration,
        status: "stale",
        suggestions,
      })
      .mockResolvedValueOnce({
        generatedAt: secondGeneration,
        status: "fresh",
        suggestions,
      });

    const refresh = await POST(
      new Request("http://localhost/api/artifacts/suggestions", {
        body: JSON.stringify({
          afterGeneration: firstGeneration.toISOString(),
          locale: "zh-CN",
          target: "quiz",
          workspaceId,
        }),
        method: "POST",
      }),
    );
    expect(await refresh.json()).toEqual({
      generation: firstGeneration.toISOString(),
      status: "pending",
      suggestions: [],
    });

    const waitingUrl = `http://localhost/api/artifacts/suggestions?workspaceId=${workspaceId}&locale=zh-CN&target=quiz&afterGeneration=${encodeURIComponent(firstGeneration.toISOString())}&waitOnly=true`;
    const waiting = await GET(new Request(waitingUrl));
    expect(waiting.status).toBe(202);
    expect(await waiting.json()).toEqual({
      generation: firstGeneration.toISOString(),
      status: "pending",
      suggestions: [],
    });
    expect(enqueueArtifactSuggestions).toHaveBeenCalledTimes(1);

    const completed = await GET(new Request(waitingUrl));
    expect(completed.status).toBe(200);
    expect(await completed.json()).toEqual({
      generation: secondGeneration.toISOString(),
      status: "fresh",
      suggestions,
    });
    expect(enqueueArtifactSuggestions).toHaveBeenCalledTimes(1);
  });

  it("polls a missing snapshot without enqueueing another workflow", async () => {
    vi.mocked(readArtifactSuggestionSnapshot).mockResolvedValue({ status: "missing" });
    const response = await GET(
      new Request(
        `http://localhost/api/artifacts/suggestions?workspaceId=${workspaceId}&locale=zh-CN&target=quiz&afterGeneration=missing&waitOnly=true`,
      ),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ generation: null, status: "pending", suggestions: [] });
    expect(enqueueArtifactSuggestions).not.toHaveBeenCalled();
  });
});
