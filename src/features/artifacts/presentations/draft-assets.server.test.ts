import sharp from "sharp";
import { expect, test, vi } from "vitest";
import type { OpenHandsAuthoringClient } from "@/features/artifacts/task-agent/openhands-client.server";
import type { Actor } from "@/features/identity/types";
import { getPresentationDraftAssets } from "./draft-assets.server";
import { PresentationError } from "./errors";
import { presentationDetailSchema } from "./types";

const actor: Actor = { handle: "owner", principalId: "principal" };
const attemptId = "00000000-0000-4000-8000-000000000001";
const input = {
  artifactId: "00000000-0000-4000-8000-000000000002",
  attemptId,
  conversationId: "00000000-0000-4000-8000-000000000003",
  paths: ["/images/hero.png"],
  workspaceId: "00000000-0000-4000-8000-000000000004",
};

function detail(generationAttemptId = attemptId) {
  return presentationDetailSchema.parse({
    artifact: null,
    createdAt: "2026-07-29T00:00:00.000Z",
    failureCode: null,
    generationAttemptId,
    generationDraft: { phase: "authoring", schemaVersion: 1 },
    generationSequence: 1,
    generationState: "generating",
    id: input.artifactId,
    kind: "presentation",
    title: "Stream",
    updatedAt: "2026-07-29T00:00:00.000Z",
    workspaceId: input.workspaceId,
  });
}

function client(downloadFile: OpenHandsAuthoringClient["downloadFile"]): OpenHandsAuthoringClient {
  return {
    continueConversation: vi.fn(),
    createConversation: vi.fn(),
    downloadArchive: vi.fn(),
    downloadFile,
    getConversation: vi.fn(),
    getServerInfo: vi.fn(),
    listEvents: vi.fn(),
    stopConversation: vi.fn(),
    uploadFile: vi.fn(),
  };
}

test("reads validated draft images only from the current attempt workspace", async () => {
  const png = new Uint8Array(
    await sharp({
      create: { background: "#ff0000", channels: 4, height: 1, width: 1 },
    })
      .png()
      .toBuffer(),
  );
  const downloadFile = vi.fn(async () => png);

  await expect(
    getPresentationDraftAssets(actor, input, {
      getDetail: async () => detail(),
      runtime: () => ({ client: client(downloadFile), workspaceRoot: "/workspace" }),
    }),
  ).resolves.toEqual([`data:image/png;base64,${Buffer.from(png).toString("base64")}`]);
  expect(downloadFile).toHaveBeenCalledWith({
    maxBytes: expect.any(Number),
    path: `/workspace/${attemptId}/out/presentation/images/hero.png`,
  });
});

test("rejects path traversal before contacting the attempt runtime", async () => {
  const runtime = vi.fn();
  await expect(
    getPresentationDraftAssets(
      actor,
      { ...input, paths: ["../secret.png"] },
      { getDetail: async () => detail(), runtime },
    ),
  ).rejects.toEqual(expect.any(PresentationError));
  expect(runtime).not.toHaveBeenCalled();
});

test("rejects stale attempt identifiers before contacting their runtime", async () => {
  const runtime = vi.fn();
  await expect(
    getPresentationDraftAssets(actor, input, {
      getDetail: async () => detail("00000000-0000-4000-8000-000000000009"),
      runtime,
    }),
  ).rejects.toMatchObject({ code: "presentation_not_found" });
  expect(runtime).not.toHaveBeenCalled();
});

test("enforces the aggregate download budget before attempting to materialize every asset", async () => {
  const invalidImage = new Uint8Array(9 * 1024 * 1024);
  const downloadFile = vi.fn(async () => invalidImage);

  await expect(
    getPresentationDraftAssets(
      actor,
      { ...input, paths: ["/images/first.png", "/images/second.png"] },
      {
        getDetail: async () => detail(),
        runtime: () => ({ client: client(downloadFile), workspaceRoot: "/workspace" }),
      },
    ),
  ).rejects.toMatchObject({ code: "presentation_editor_project_invalid" });
  expect(downloadFile).toHaveBeenCalledTimes(2);
});
