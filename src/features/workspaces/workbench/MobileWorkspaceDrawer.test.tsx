import { fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
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
    "/teacher/optics?conversation=conversation-1&view=overview",
  );
  expect(screen.getByRole("link", { name: "折射实验" })).toHaveAttribute(
    "href",
    "/teacher/optics?conversation=conversation-1",
  );
  expect(screen.getByRole("link", { name: /高等数学/ })).toHaveAttribute(
    "href",
    "/teacher/math?view=overview",
  );
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
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "棱镜" } });
  expect(screen.getByRole("link", { name: "棱镜配色" })).toBeInTheDocument();
});
