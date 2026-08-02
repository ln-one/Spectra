import { screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import {
  canManageArtifactForConversation,
  getArtifactDetailForConversation,
} from "@/features/artifacts/workbench-server";
import { getWorkspaceById } from "@/features/workspaces/service";
import { renderWithIntl } from "../../../../../tests/render";
import PresentationEditorPage from "./page";

vi.mock("@/features/identity/current", () => ({
  getCurrentActor: vi.fn().mockResolvedValue({ handle: "developer", principalId: "owner-id" }),
}));
vi.mock("@/features/workspaces/service", () => ({
  getWorkspaceById: vi.fn(),
}));
vi.mock("@/features/artifacts/workbench-server", () => ({
  canManageArtifactForConversation: vi.fn(),
  getArtifactDetailForConversation: vi.fn(),
}));
vi.mock("@/features/workspaces/workbench/PresentationStandaloneEditorView", () => ({
  PresentationStandaloneEditorView: (props: {
    detail: { title: string };
    readOnly: boolean;
    returnHref: string;
  }) => (
    <div
      data-read-only={String(props.readOnly)}
      data-return-href={props.returnHref}
      data-testid="standalone-editor"
    >
      {props.detail.title}
    </div>
  ),
}));

const workspaceId = "00000000-0000-4000-8000-000000000001";
const artifactId = "00000000-0000-4000-8000-000000000002";
const revisionId = "00000000-0000-4000-8000-000000000003";
const conversationId = "00000000-0000-4000-8000-000000000004";
const timestamp = "2026-07-29T00:00:00.000Z";

beforeEach(() => {
  vi.mocked(getWorkspaceById).mockReset().mockResolvedValue({
    archivedAt: null,
    createdAt: timestamp,
    id: workspaceId,
    name: "Course",
    ownerHandle: "developer",
    ownerId: "owner-id",
    slug: "course",
    updatedAt: timestamp,
    visibility: "private",
  });
  vi.mocked(getArtifactDetailForConversation)
    .mockReset()
    .mockResolvedValue({
      artifact: {
        createdAt: timestamp,
        currentRevision: {
          artifactId,
          content: {
            pageCount: 1,
            pageTitles: ["Cover"],
            schemaVersion: 1,
            summary: "Summary",
            title: "Standalone presentation",
          },
          contentSha256: "a".repeat(64),
          createdAt: timestamp,
          id: revisionId,
          parentRevisionId: null,
          revisionNumber: 1,
        },
        groundingSources: [],
        id: artifactId,
        title: "Standalone presentation",
        updatedAt: timestamp,
        workspaceId,
      },
      createdAt: timestamp,
      failureCode: null,
      generationAttemptId: null,
      generationDraft: null,
      generationSequence: 1,
      generationState: "ready",
      id: artifactId,
      kind: "presentation",
      title: "Standalone presentation",
      updatedAt: timestamp,
      workspaceId,
    });
  vi.mocked(canManageArtifactForConversation).mockReset().mockResolvedValue(true);
});

test("loads a ready Presentation through its dedicated authorized route", async () => {
  renderWithIntl(
    await PresentationEditorPage({
      params: Promise.resolve({ artifactId }),
      searchParams: Promise.resolve({ conversation: conversationId, workspaceId }),
    }),
  );

  expect(screen.getByTestId("standalone-editor")).toHaveTextContent("Standalone presentation");
  expect(screen.getByTestId("standalone-editor")).toHaveAttribute("data-read-only", "false");
  expect(screen.getByTestId("standalone-editor")).toHaveAttribute(
    "data-return-href",
    `/developer/course?artifact=${artifactId}&conversation=${conversationId}`,
  );
  expect(getArtifactDetailForConversation).toHaveBeenCalledWith(
    expect.objectContaining({ principalId: "owner-id" }),
    { artifactId, conversationId, workspaceId },
  );
});

test("rejects malformed route identifiers before loading workspace data", async () => {
  await expect(
    PresentationEditorPage({
      params: Promise.resolve({ artifactId: "not-an-id" }),
      searchParams: Promise.resolve({ conversation: conversationId, workspaceId }),
    }),
  ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  expect(getWorkspaceById).not.toHaveBeenCalled();
});
