import { beforeEach, expect, test, vi } from "vitest";
import { readArtifactDbosStream } from "@/features/artifacts/dbos-realtime.server";
import { getArtifactDetailForConversation } from "@/features/artifacts/workbench-server";
import { getCurrentActor } from "@/features/identity/current";
import { GET } from "./route";

vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/artifacts/workbench-server", () => ({
  getArtifactDetailForConversation: vi.fn(),
}));
vi.mock("@/features/artifacts/dbos-realtime.server", () => ({
  readArtifactDbosStream: vi.fn(),
}));

const actor = { handle: "alice", principalId: "00000000-0000-4000-8000-000000000621" };
const workspaceId = "00000000-0000-4000-8000-000000000622";
const conversationId = "00000000-0000-4000-8000-000000000623";
const artifactId = "00000000-0000-4000-8000-000000000624";
const streamId = "00000000-0000-4000-8000-000000000625";
const closeResume = vi.fn(async () => undefined);

function request(activeStreamId = streamId, afterSequence = 0) {
  return new Request(
    `http://localhost/api/artifacts/${artifactId}/stream?workspaceId=${workspaceId}&conversationId=${conversationId}&attemptId=${activeStreamId}&afterSequence=${afterSequence}`,
  );
}

beforeEach(() => {
  vi.mocked(getCurrentActor).mockReset().mockResolvedValue(actor);
  vi.mocked(getArtifactDetailForConversation).mockReset().mockResolvedValue({
    artifact: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    draft: null,
    failureCode: null,
    generationState: "generating",
    id: artifactId,
    kind: "teaching_document",
    generationAttemptId: streamId,
    generationSequence: 0,
    title: "Doc",
    updatedAt: "2026-07-18T00:00:00.000Z",
    workspaceId,
  });
  vi.mocked(readArtifactDbosStream)
    .mockReset()
    .mockResolvedValue({
      close: closeResume,
      stream: new ReadableStream<string>({
        start(controller) {
          controller.enqueue(
            '{"delta":"Streaming","event":"text_delta","kind":"teaching_document","sequence":1,"startOffset":0,"version":3}',
          );
          controller.close();
        },
      }),
    });
  closeResume.mockClear();
});

test("authorizes and reads the active Artifact snapshot stream", async () => {
  const response = await GET(request(streamId), {
    params: Promise.resolve({ artifactId }),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/x-ndjson");
  expect(response.headers.get("x-artifact-attempt-id")).toBe(streamId);
  expect(JSON.parse((await response.text()).trim())).toEqual({
    delta: "Streaming",
    event: "text_delta",
    kind: "teaching_document",
    sequence: 1,
    startOffset: 0,
    version: 3,
  });
  expect(closeResume).toHaveBeenCalledTimes(1);
  expect(readArtifactDbosStream).toHaveBeenCalledWith({
    attemptId: streamId,
  });
});

test("rejects a stale stream id without opening another Artifact stream", async () => {
  const response = await GET(request("00000000-0000-4000-8000-000000000626"), {
    params: Promise.resolve({ artifactId }),
  });
  expect(response.status).toBe(409);
  expect(readArtifactDbosStream).not.toHaveBeenCalled();
});

test("filters replayed and out-of-order events at the HTTP resume boundary", async () => {
  vi.mocked(readArtifactDbosStream).mockResolvedValueOnce({
    close: closeResume,
    stream: new ReadableStream<string>({
      start(controller) {
        for (const sequence of [2, 1, 3]) {
          controller.enqueue(
            JSON.stringify({
              delta: String(sequence),
              event: "text_delta",
              kind: "teaching_document",
              sequence,
              startOffset: sequence - 1,
              version: 3,
            }),
          );
        }
        controller.close();
      },
    }),
  });

  const response = await GET(request(streamId, 2), { params: Promise.resolve({ artifactId }) });
  const events = (await response.text())
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ sequence: 3 });
});

test("closes the durable stream resume session when the HTTP body is cancelled", async () => {
  const cancelStream = vi.fn();
  vi.mocked(readArtifactDbosStream).mockResolvedValueOnce({
    close: closeResume,
    stream: new ReadableStream<string>({ cancel: cancelStream }),
  });
  const response = await GET(request(), { params: Promise.resolve({ artifactId }) });

  await response.body?.cancel("navigation");

  expect(cancelStream).toHaveBeenCalledWith("navigation");
  expect(closeResume).toHaveBeenCalledTimes(1);
});
