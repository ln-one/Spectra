import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { renderWithIntl } from "../../../../tests/render";
import { MobileWorkspaceDrawer } from "./MobileWorkspaceDrawer";

test("opens the mobile drawer and exposes workspace and conversation navigation", () => {
  renderWithIntl(
    <MobileWorkspaceDrawer
      accountMenu={<button type="button">账户</button>}
      conversationId="conversation-1"
      conversations={[
        {
          conversationId: "conversation-1",
          title: "折射实验",
          updatedAt: "2026-10-13T09:00:00.000Z",
        },
      ]}
      currentWorkspaceId="workspace-1"
      newConversationHref="/teacher/optics?conversation=new"
      settingsControl={<button type="button">设置</button>}
      workspaceHref="/teacher/optics"
      workspaces={[
        {
          href: "/teacher/optics",
          id: "workspace-1",
          name: "光学课程",
          ownerHandle: "teacher",
          updatedAt: "2026-10-13T09:00:00.000Z",
        },
        {
          href: "/teacher/math",
          id: "workspace-2",
          name: "高等数学",
          ownerHandle: "teacher",
          updatedAt: "2026-10-12T09:00:00.000Z",
        },
      ]}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "打开工作空间导航" }));

  expect(screen.getByRole("dialog", { name: "Spectra" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /光学课程/ })).toHaveAttribute(
    "href",
    "/teacher/optics?view=overview",
  );
  expect(screen.getByRole("link", { name: "折射实验" })).toHaveAttribute(
    "href",
    "/teacher/optics?conversation=conversation-1",
  );
  expect(screen.getByRole("link", { name: /高等数学/ })).toHaveAttribute(
    "href",
    "/teacher/math?view=overview",
  );

  fireEvent.click(screen.getByRole("button", { name: "收起光学课程的内容" }));
  expect(screen.queryByRole("link", { name: "折射实验" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /光学课程/ })).toHaveAttribute(
    "href",
    "/teacher/optics?view=overview",
  );
  fireEvent.click(screen.getByRole("button", { name: "展开光学课程的内容" }));
  expect(screen.getByRole("link", { name: "折射实验" })).toBeInTheDocument();
});

test("loads older conversations from the mobile drawer", () => {
  const onLoadMore = vi.fn();
  renderWithIntl(
    <MobileWorkspaceDrawer
      accountMenu={null}
      conversationId="conversation-1"
      conversations={[]}
      currentWorkspaceId="workspace-1"
      newConversationHref="/teacher/optics?conversation=new"
      settingsControl={null}
      workspaceHref="/teacher/optics"
      workspaces={[
        {
          href: "/teacher/optics",
          id: "workspace-1",
          name: "光学课程",
          ownerHandle: "teacher",
          updatedAt: "2026-10-13T09:00:00.000Z",
        },
      ]}
      hasNextPage
      onLoadMore={onLoadMore}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "打开工作空间导航" }));
  fireEvent.click(screen.getByRole("button", { name: "加载更多对话" }));
  expect(onLoadMore).toHaveBeenCalledOnce();
});

test("filters workspace navigation without losing current conversation matches", () => {
  renderWithIntl(
    <MobileWorkspaceDrawer
      accountMenu={null}
      conversationId="conversation-1"
      conversations={[
        {
          conversationId: "conversation-1",
          title: "棱镜配色",
          updatedAt: "2026-10-13T09:00:00.000Z",
        },
      ]}
      currentWorkspaceId="workspace-1"
      newConversationHref="/teacher/optics?conversation=new"
      settingsControl={null}
      workspaceHref="/teacher/optics"
      workspaces={[
        {
          href: "/teacher/optics",
          id: "workspace-1",
          name: "光学课程",
          ownerHandle: "teacher",
          updatedAt: "2026-10-13T09:00:00.000Z",
        },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "打开工作空间导航" }));
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "棱镜" },
  });
  expect(screen.getByRole("link", { name: "棱镜配色" })).toBeInTheDocument();
});

test("opens sources and the creation tools page from mobile navigation", () => {
  const onOpenSources = vi.fn();
  const onOpenCreationTools = vi.fn();
  renderWithIntl(
    <MobileWorkspaceDrawer
      accountMenu={null}
      conversationId="conversation-1"
      conversations={[]}
      currentWorkspaceId="workspace-1"
      newConversationHref="/teacher/optics?conversation=new"
      onOpenCreationTools={onOpenCreationTools}
      onOpenSources={onOpenSources}
      settingsControl={null}
      workspaceHref="/teacher/optics"
      workspaces={[]}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "打开工作空间导航" }));
  fireEvent.click(screen.getByRole("button", { name: "创作工具" }));
  expect(onOpenCreationTools).toHaveBeenCalledOnce();

  fireEvent.click(screen.getByRole("button", { name: "打开工作空间导航" }));
  fireEvent.click(screen.getByRole("button", { name: "资料来源" }));
  expect(onOpenSources).toHaveBeenCalledOnce();
});

test("shows workspace creation results and lets the user collapse each section", () => {
  renderWithIntl(
    <MobileWorkspaceDrawer
      accountMenu={null}
      conversationId="00000000-0000-4000-8000-000000000001"
      conversations={[
        {
          conversationId: "00000000-0000-4000-8000-000000000001",
          title: "机器学习讨论",
          updatedAt: "2026-10-13T09:00:00.000Z",
        },
      ]}
      currentWorkspaceId="00000000-0000-4000-8000-000000000002"
      newConversationHref="/teacher/ml?conversation=new"
      settingsControl={null}
      workspaceArtifacts={[
        {
          conversationId: "00000000-0000-4000-8000-000000000001",
          createdAt: "2026-10-13T08:30:00.000Z",
          currentRevisionId: "00000000-0000-4000-8000-000000000004",
          generationState: "ready",
          id: "00000000-0000-4000-8000-000000000003",
          kind: "mind_map",
          title: "机器学习基础",
          updatedAt: "2026-10-13T09:10:00.000Z",
        },
      ]}
      workspaceHref="/teacher/ml"
      workspaces={[
        {
          href: "/teacher/ml",
          id: "00000000-0000-4000-8000-000000000002",
          name: "机器学习",
          ownerHandle: "teacher",
          updatedAt: "2026-10-13T09:00:00.000Z",
        },
      ]}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "打开工作空间导航" }));
  expect(screen.getByRole("link", { name: /机器学习基础/ })).toHaveAttribute(
    "href",
    "/teacher/ml?conversation=00000000-0000-4000-8000-000000000001&artifact=00000000-0000-4000-8000-000000000003",
  );

  fireEvent.click(screen.getByRole("button", { name: /创作成果/ }));
  expect(screen.queryByRole("link", { name: /机器学习基础/ })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "机器学习讨论" })).toBeInTheDocument();
});
