import { screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { loadAiMessagePage } from "@/features/agents/message-records";
import { loadWorkspaceConversationPage } from "@/features/agents/server";
import {
  canManageArtifactForConversation,
  getArtifactDetailForConversation,
  listArtifactHistory,
} from "@/features/artifacts/workbench-server";
import { listWorkspaceSources } from "@/features/sources/service";
import { WorkspaceError } from "@/features/workspaces/errors";
import { getWorkspaceById } from "@/features/workspaces/service";
import { getWorkspaceSharingState } from "@/features/workspaces/sharing.server";
import { renderWithIntl } from "../../../../../tests/render";
import WorkspacePage from "./page";

vi.mock("@/features/identity/current", () => ({
  getCurrentActor: vi.fn().mockResolvedValue({ principalId: "owner-id", handle: "developer" }),
}));
vi.mock("@/features/workspaces/service", () => ({ getWorkspaceById: vi.fn() }));
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

const mockedGetWorkspaceById = vi.mocked(getWorkspaceById);
const mockedListWorkspaceSources = vi.mocked(listWorkspaceSources);
const mockedLoadWorkspaceConversationPage = vi.mocked(loadWorkspaceConversationPage);
const mockedListArtifactHistory = vi.mocked(listArtifactHistory);
const mockedGetArtifactDetailForConversation = vi.mocked(getArtifactDetailForConversation);
const workspaceId = "00000000-0000-4000-8000-000000000100";

beforeEach(() => {
  mockedGetWorkspaceById.mockReset();
  mockedListWorkspaceSources.mockResolvedValue([]);
  mockedLoadWorkspaceConversationPage.mockReset().mockResolvedValue({
    conversationId: "00000000-0000-4000-8000-000000000001",
    items: [],
    nextCursor: null,
  });
  vi.mocked(loadAiMessagePage).mockReset().mockResolvedValue({ items: [], nextCursor: null });
  mockedListArtifactHistory.mockReset().mockResolvedValue([]);
  mockedGetArtifactDetailForConversation.mockReset();
  vi.mocked(canManageArtifactForConversation).mockReset().mockResolvedValue(true);
  vi.mocked(getWorkspaceSharingState).mockReset().mockResolvedValue({
    canManage: true,
    firstSharedAt: null,
    members: [],
    referenceable: false,
    slug: null,
    visibility: "private",
  });
});

test("renders an unaliased workspace through its internal id", async () => {
  mockedGetWorkspaceById.mockResolvedValue({
    id: workspaceId,
    ownerId: "owner-id",
    ownerHandle: "developer",
    slug: null,
    name: "材料实验记录",
    visibility: "private",
    archivedAt: null,
    createdAt: "2026-07-14T00:00:00Z",
    updatedAt: "2026-07-14T00:00:00Z",
  });

  renderWithIntl(
    await WorkspacePage({
      params: Promise.resolve({ id: workspaceId }),
      searchParams: Promise.resolve({
        conversation: "00000000-0000-4000-8000-000000000001",
      }),
    }),
  );

  expect(screen.getByRole("banner")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "材料实验记录" })).toBeInTheDocument();
  expect(screen.getByTestId("studio-panel")).toBeInTheDocument();
  expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  expect(screen.getByTestId("sources-panel")).toBeInTheDocument();
  expect(screen.getByText("智能课件")).toBeInTheDocument();
  expect(await screen.findByText("今天想从哪里开始？")).toBeInTheDocument();
  expect(
    screen.getByText("你可以直接提问，也可以先添加资料，再让 Spectra 帮你整理或创作。"),
  ).toBeInTheDocument();
  expect(screen.getByText("0 项资料")).toBeInTheDocument();
  expect(screen.queryByText("PPT 生成记录")).not.toBeInTheDocument();
  expect(screen.queryByText("proj_mock_base")).not.toBeInTheDocument();
});

test("redirects an aliased workspace without permanently caching its mutable slug", async () => {
  mockedGetWorkspaceById.mockResolvedValue({
    id: workspaceId,
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
    WorkspacePage({ params: Promise.resolve({ id: workspaceId }) }),
  ).rejects.toMatchObject({
    digest:
      "NEXT_REDIRECT;replace;/developer/material-lab?conversation=00000000-0000-4000-8000-000000000001;307;",
  });
});

test("redirects an unaliased workspace without a query to its selected thread", async () => {
  mockedGetWorkspaceById.mockResolvedValue({
    id: workspaceId,
    ownerId: "owner-id",
    ownerHandle: "developer",
    slug: null,
    name: "材料实验记录",
    visibility: "private",
    archivedAt: null,
    createdAt: "2026-07-14T00:00:00Z",
    updatedAt: "2026-07-14T00:00:00Z",
  });

  await expect(
    WorkspacePage({ params: Promise.resolve({ id: workspaceId }) }),
  ).rejects.toMatchObject({
    digest: `NEXT_REDIRECT;replace;/workspaces/${workspaceId}?conversation=00000000-0000-4000-8000-000000000001;307;`,
  });
});

test("loads the conversation selected by the URL", async () => {
  const workspace = {
    id: workspaceId,
    ownerId: "owner-id",
    ownerHandle: "developer",
    slug: null,
    name: "材料实验记录",
    visibility: "private" as const,
    archivedAt: null,
    createdAt: "2026-07-14T00:00:00Z",
    updatedAt: "2026-07-14T00:00:00Z",
  };
  mockedGetWorkspaceById.mockResolvedValue(workspace);
  const conversationId = "00000000-0000-4000-8000-000000000009";

  await WorkspacePage({
    params: Promise.resolve({ id: workspaceId }),
    searchParams: Promise.resolve({ conversation: conversationId }),
  });

  expect(mockedLoadWorkspaceConversationPage).toHaveBeenCalledWith(
    expect.objectContaining({
      emptyConversationId: expect.any(String),
      requestedConversationId: conversationId,
      actor: expect.objectContaining({ principalId: "owner-id" }),
      workspace,
    }),
    expect.anything(),
  );
});

test("server-renders the persisted UIMessage snapshot after refresh", async () => {
  mockedGetWorkspaceById.mockResolvedValue({
    archivedAt: null,
    createdAt: "2026-07-14T00:00:00Z",
    id: workspaceId,
    name: "材料实验记录",
    ownerHandle: "developer",
    ownerId: "owner-id",
    slug: null,
    updatedAt: "2026-07-14T00:00:00Z",
    visibility: "private",
  });
  vi.mocked(loadAiMessagePage).mockResolvedValue({
    items: [
      {
        id: "user:refresh",
        parts: [{ text: "刷新后仍然可见的问题", type: "text" }],
        role: "user",
      },
      {
        id: "assistant:refresh",
        parts: [{ text: "刷新后仍然可见的回答", type: "text" }],
        role: "assistant",
      },
    ],
    nextCursor: null,
  });

  renderWithIntl(
    await WorkspacePage({
      params: Promise.resolve({ id: workspaceId }),
      searchParams: Promise.resolve({
        conversation: "00000000-0000-4000-8000-000000000001",
      }),
    }),
  );

  expect(await screen.findByText("刷新后仍然可见的问题")).toBeInTheDocument();
  expect(await screen.findByText("刷新后仍然可见的回答")).toBeInTheDocument();
  expect(screen.queryByText("今天想从哪里开始？")).not.toBeInTheDocument();
});

test("redirects an invalid conversation query to the canonical workspace URL", async () => {
  await expect(
    WorkspacePage({
      params: Promise.resolve({ id: workspaceId }),
      searchParams: Promise.resolve({ conversation: "invalid" }),
    }),
  ).rejects.toMatchObject({
    digest: `NEXT_REDIRECT;replace;/workspaces/${workspaceId};307;`,
  });
  expect(mockedGetWorkspaceById).not.toHaveBeenCalled();
});

test("maps an unreadable workspace to the Next.js 404 boundary", async () => {
  mockedGetWorkspaceById.mockRejectedValue(new WorkspaceError("workspace_not_found"));

  await expect(
    WorkspacePage({ params: Promise.resolve({ id: "missing-workspace" }) }),
  ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
});
