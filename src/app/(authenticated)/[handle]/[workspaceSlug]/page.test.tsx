import { screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { loadAiMessagePage } from "@/features/agents/message-records";
import { loadWorkspaceConversationPage } from "@/features/agents/server";
import type { TeachingDocumentArtifact } from "@/features/artifacts/documents/types";
import { ArtifactError } from "@/features/artifacts/errors";
import {
  canManageArtifactForConversation,
  getArtifactDetailForConversation,
  listArtifactHistory,
} from "@/features/artifacts/workbench-server";
import { listWorkspaceSources } from "@/features/sources/service";
import { WorkspaceError } from "@/features/workspaces/errors";
import { findWorkspaceAddressPreview, resolveWorkspace } from "@/features/workspaces/service";
import { getWorkspaceSharingState } from "@/features/workspaces/sharing.server";
import { renderWithIntl } from "../../../../../tests/render";
import WorkspacePage from "./page";

vi.mock("@/features/identity/current", () => ({
  getCurrentActor: vi.fn().mockResolvedValue({ principalId: "owner-id", handle: "developer" }),
}));
vi.mock("@/features/workspaces/service", () => ({
  findWorkspaceAddressPreview: vi.fn(),
  resolveWorkspace: vi.fn(),
}));
vi.mock("@/features/workspaces/sharing.server", () => ({
  getWorkspaceSharingState: vi.fn(),
}));
vi.mock("@/features/sources/service", () => ({ listWorkspaceSources: vi.fn() }));
vi.mock("@/features/agents/server", () => ({ loadWorkspaceConversationPage: vi.fn() }));
vi.mock("@/features/agents/message-records", () => ({ loadAiMessagePage: vi.fn() }));
vi.mock("@/features/artifacts/workbench-server", () => ({
  canManageArtifactForConversation: vi.fn(),
  getArtifactDetailForConversation: vi.fn(),
  listArtifactHistory: vi.fn(),
}));
vi.mock("@/features/artifacts/task-agent/config.server", () => ({
  artifactCreationCapabilities: () => new Set(["presentation"]),
  artifactPublishedCapabilities: () => new Set(["presentation", "animation"]),
}));

const mockedResolveWorkspace = vi.mocked(resolveWorkspace);
const mockedListWorkspaceSources = vi.mocked(listWorkspaceSources);
const mockedLoadWorkspaceConversationPage = vi.mocked(loadWorkspaceConversationPage);
const mockedListArtifactHistory = vi.mocked(listArtifactHistory);
const mockedGetArtifactDetailForConversation = vi.mocked(getArtifactDetailForConversation);

beforeEach(() => {
  mockedResolveWorkspace.mockReset();
  mockedListWorkspaceSources.mockResolvedValue([]);
  mockedLoadWorkspaceConversationPage.mockResolvedValue({
    conversationId: "00000000-0000-4000-8000-000000000001",
    items: [],
    nextCursor: null,
  });
  vi.mocked(loadAiMessagePage).mockReset().mockResolvedValue({ items: [], nextCursor: null });
  mockedListArtifactHistory.mockReset().mockResolvedValue([]);
  mockedGetArtifactDetailForConversation.mockReset();
  vi.mocked(canManageArtifactForConversation).mockReset().mockResolvedValue(true);
  vi.mocked(findWorkspaceAddressPreview).mockReset().mockResolvedValue(null);
  vi.mocked(getWorkspaceSharingState).mockReset().mockResolvedValue({
    canManage: true,
    firstSharedAt: null,
    members: [],
    referenceable: false,
    slug: "material-lab",
    visibility: "private",
  });
});

test("renders the Workbench with the resolved workspace", async () => {
  mockedResolveWorkspace.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000100",
    ownerId: "owner-id",
    ownerHandle: "developer",
    slug: "material-lab",
    name: "材料实验记录",
    visibility: "private",
    archivedAt: null,
    createdAt: "2026-07-14T00:00:00Z",
    updatedAt: "2026-07-14T00:00:00Z",
  });

  renderWithIntl(
    await WorkspacePage({
      params: Promise.resolve({ handle: "developer", workspaceSlug: "material-lab" }),
      searchParams: Promise.resolve({
        conversation: "00000000-0000-4000-8000-000000000001",
      }),
    }),
  );

  expect(screen.getByRole("heading", { name: "材料实验记录" })).toBeInTheDocument();
  expect(screen.getByText("智能课件")).toBeInTheDocument();
  expect(await screen.findByText("今天想从哪里开始？")).toBeInTheDocument();
  expect(
    screen.getByText("你可以直接提问，也可以先添加资料，再让 Spectra 帮你整理或创作。"),
  ).toBeInTheDocument();
  expect(screen.getByText("0 项资料")).toBeInTheDocument();
  expect(screen.queryByText("PPT 生成记录")).not.toBeInTheDocument();
  expect(screen.queryByText("proj_mock_base")).not.toBeInTheDocument();
});

test("redirects a workspace without a conversation query to its selected thread", async () => {
  mockedResolveWorkspace.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000100",
    ownerId: "owner-id",
    ownerHandle: "developer",
    slug: "material-lab",
    name: "材料实验记录",
    visibility: "private",
    archivedAt: null,
    createdAt: "2026-07-14T00:00:00Z",
    updatedAt: "2026-07-14T00:00:00Z",
  });

  await expect(
    WorkspacePage({
      params: Promise.resolve({ handle: "developer", workspaceSlug: "material-lab" }),
    }),
  ).rejects.toMatchObject({
    digest:
      "NEXT_REDIRECT;replace;/developer/material-lab?conversation=00000000-0000-4000-8000-000000000001;307;",
  });
});

test("maps an unreadable workspace to the Next.js 404 boundary", async () => {
  mockedResolveWorkspace.mockRejectedValue(new WorkspaceError("workspace_not_found"));

  await expect(
    WorkspacePage({
      params: Promise.resolve({ handle: "developer", workspaceSlug: "missing" }),
    }),
  ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
});

test("redirects an invalid conversation query to the canonical workspace URL", async () => {
  await expect(
    WorkspacePage({
      params: Promise.resolve({ handle: "developer", workspaceSlug: "material-lab" }),
      searchParams: Promise.resolve({ conversation: ["one", "two"] }),
    }),
  ).rejects.toMatchObject({ digest: "NEXT_REDIRECT;replace;/developer/material-lab;307;" });
  expect(mockedResolveWorkspace).not.toHaveBeenCalled();
});

test("loads a deep-linked artifact only through the current conversation", async () => {
  const workspace = {
    archivedAt: null,
    createdAt: "2026-07-14T00:00:00Z",
    id: "00000000-0000-4000-8000-000000000501",
    name: "材料实验记录",
    ownerHandle: "developer",
    ownerId: "owner-id",
    slug: "material-lab",
    updatedAt: "2026-07-14T00:00:00Z",
    visibility: "private" as const,
  };
  const conversationId = "00000000-0000-4000-8000-000000000502";
  const artifactId = "00000000-0000-4000-8000-000000000503";
  mockedResolveWorkspace.mockResolvedValue(workspace);
  mockedLoadWorkspaceConversationPage.mockResolvedValue({
    conversationId,
    items: [],
    nextCursor: null,
  });
  const readyArtifact: TeachingDocumentArtifact = {
    createdAt: "2026-07-18T00:00:00.000Z",
    currentRevision: {
      artifactId,
      content: {
        document: {
          content: [
            {
              attrs: { id: "body" },
              content: [{ text: "Body", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        },
        generation: { outcome: "complete", rawOutput: "Body", warnings: [] },
        schemaVersion: 2,
        sourceMarkdown: "Body",
        title: "Doc",
      },
      contentSha256: "a".repeat(64),
      createdAt: "2026-07-18T00:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000504",
      parentRevisionId: null,
      revisionNumber: 1,
    },
    id: artifactId,
    title: "Doc",
    updatedAt: "2026-07-18T00:00:00.000Z",
    workspaceId: workspace.id,
  };
  mockedGetArtifactDetailForConversation.mockResolvedValue({
    artifact: readyArtifact,
    createdAt: readyArtifact.createdAt,
    draft: null,
    failureCode: null,
    generationState: "ready",
    id: readyArtifact.id,
    kind: "teaching_document",
    generationAttemptId: null,
    generationSequence: 0,
    title: readyArtifact.title,
    updatedAt: readyArtifact.updatedAt,
    workspaceId: readyArtifact.workspaceId,
  });

  await WorkspacePage({
    params: Promise.resolve({ handle: "developer", workspaceSlug: "material-lab" }),
    searchParams: Promise.resolve({ artifact: artifactId, conversation: conversationId }),
  });

  expect(mockedGetArtifactDetailForConversation).toHaveBeenCalledWith(
    expect.objectContaining({ principalId: "owner-id" }),
    { artifactId, conversationId, workspaceId: workspace.id },
    expect.anything(),
  );
});

test("renders a ready Presentation deep link in the Workbench", async () => {
  const workspace = {
    archivedAt: null,
    createdAt: "2026-07-14T00:00:00Z",
    id: "00000000-0000-4000-8000-000000000521",
    name: "材料实验记录",
    ownerHandle: "developer",
    ownerId: "owner-id",
    slug: "material-lab",
    updatedAt: "2026-07-14T00:00:00Z",
    visibility: "private" as const,
  };
  const conversationId = "00000000-0000-4000-8000-000000000522";
  const artifactId = "00000000-0000-4000-8000-000000000523";
  mockedResolveWorkspace.mockResolvedValue(workspace);
  mockedLoadWorkspaceConversationPage.mockResolvedValue({
    conversationId,
    items: [],
    nextCursor: null,
  });
  mockedGetArtifactDetailForConversation.mockResolvedValue({
    artifact: {
      createdAt: "2026-07-29T00:00:00.000Z",
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
        createdAt: "2026-07-29T00:00:00.000Z",
        id: "00000000-0000-4000-8000-000000000524",
        parentRevisionId: null,
        revisionNumber: 1,
      },
      groundingSources: [],
      id: artifactId,
      title: "Standalone presentation",
      updatedAt: "2026-07-29T00:00:00.000Z",
      workspaceId: workspace.id,
    },
    createdAt: "2026-07-29T00:00:00.000Z",
    failureCode: null,
    generationAttemptId: null,
    generationDraft: null,
    generationSequence: 1,
    generationState: "ready",
    id: artifactId,
    kind: "presentation",
    title: "Standalone presentation",
    updatedAt: "2026-07-29T00:00:00.000Z",
    workspaceId: workspace.id,
  });

  const result = await WorkspacePage({
    params: Promise.resolve({ handle: "developer", workspaceSlug: "material-lab" }),
    searchParams: Promise.resolve({ artifact: artifactId, conversation: conversationId }),
  });
  expect(result).toMatchObject({
    props: {
      initialArtifact: { id: artifactId, kind: "presentation" },
    },
  });
});

test("cleans a deep link whose artifact is outside the current conversation", async () => {
  mockedResolveWorkspace.mockResolvedValue({
    archivedAt: null,
    createdAt: "2026-07-14T00:00:00Z",
    id: "00000000-0000-4000-8000-000000000511",
    name: "材料实验记录",
    ownerHandle: "developer",
    ownerId: "owner-id",
    slug: "material-lab",
    updatedAt: "2026-07-14T00:00:00Z",
    visibility: "private",
  });
  mockedGetArtifactDetailForConversation.mockRejectedValue(new ArtifactError("artifact_not_found"));
  const conversationId = "00000000-0000-4000-8000-000000000512";
  const artifactId = "00000000-0000-4000-8000-000000000513";

  await expect(
    WorkspacePage({
      params: Promise.resolve({ handle: "developer", workspaceSlug: "material-lab" }),
      searchParams: Promise.resolve({ artifact: artifactId, conversation: conversationId }),
    }),
  ).rejects.toMatchObject({
    digest: `NEXT_REDIRECT;replace;/developer/material-lab?conversation=${conversationId};307;`,
  });
});
