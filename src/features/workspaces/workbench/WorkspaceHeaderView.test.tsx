import { fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderWithIntl } from "../../../../tests/render";
import { WorkspaceHeaderView } from "./WorkspaceHeaderView";

const currentConversationId = "00000000-0000-4000-8000-000000000001";
const newConversationId = "00000000-0000-4000-8000-000000000002";
const olderConversationId = "00000000-0000-4000-8000-000000000004";

function renderHeader(
  conversations = [
    {
      conversationId: currentConversationId,
      title: null,
      updatedAt: "2026-07-16T05:00:00.000Z",
    },
    {
      conversationId: olderConversationId,
      title: "旧对话",
      updatedAt: "2026-07-15T05:00:00.000Z",
    },
  ],
) {
  renderWithIntl(
    <WorkspaceHeaderView
      workspaceName="测试空间"
      threadTitle="新对话"
      accountMenu={<button type="button">账户</button>}
      conversationId={currentConversationId}
      conversations={conversations}
      deleteThreadAction={async () => null}
      newConversationId={newConversationId}
      renameThreadAction={async () => null}
      settingsAction={async () => null}
      settingsControl={<button type="button">设置</button>}
      workspaceId="00000000-0000-4000-8000-000000000003"
      workspaceHref="/workspaces/00000000-0000-4000-8000-000000000003"
      workspaceSlug="human-design"
    />,
  );
}

test("edits the workspace name directly from the title", () => {
  renderHeader();

  fireEvent.click(screen.getByRole("button", { name: "重命名测试空间" }));

  const input = screen.getByRole("textbox", { name: "工作空间名称" });
  expect(input).toHaveValue("测试空间");
  expect(input).toHaveFocus();
  expect(document.querySelector('input[name="workspaceId"]')).toHaveValue(
    "00000000-0000-4000-8000-000000000003",
  );
  expect(document.querySelector('input[name="conversationId"]')).toHaveValue(currentConversationId);
  expect(document.querySelector('input[name="slug"]')).toHaveValue("human-design");

  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByRole("textbox", { name: "工作空间名称" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "重命名测试空间" })).toBeInTheDocument();
});

test("links new and existing conversations without client-owned state", () => {
  renderHeader();
  expect(screen.getByRole("link", { name: "返回工作空间" })).toHaveAttribute("href", "/workspaces");
  fireEvent.pointerDown(screen.getByRole("button", { name: /对话/ }), {
    button: 0,
    ctrlKey: false,
  });

  expect(screen.getByRole("menuitem", { name: "新对话" })).toHaveAttribute(
    "href",
    `/workspaces/00000000-0000-4000-8000-000000000003?conversation=${newConversationId}`,
  );
  const currentItem = screen
    .getByRole("menu")
    .querySelector(`a[href$="conversation=${currentConversationId}"]`);
  expect(currentItem).not.toBeNull();
  expect(currentItem).toHaveAttribute(
    "href",
    `/workspaces/00000000-0000-4000-8000-000000000003?conversation=${currentConversationId}`,
  );
  expect(currentItem).toHaveAttribute("aria-current", "page");
});

test("keeps a long conversation history inside a scrollable viewport", () => {
  const conversations = Array.from({ length: 40 }, (_, index) => ({
    conversationId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    title: `对话 ${index + 1}`,
    updatedAt: "2026-07-16T05:00:00.000Z",
  }));
  renderHeader(conversations);

  fireEvent.pointerDown(screen.getByRole("button", { name: "对话 1" }), {
    button: 0,
    ctrlKey: false,
  });

  const menu = screen.getByRole("menu");
  expect(menu).toHaveStyle({
    maxHeight: "min(34rem, calc(var(--radix-dropdown-menu-content-available-height) - 0.5rem))",
  });
  expect(menu).toHaveClass("flex", "overflow-visible");
  const list = screen.getByTestId("workspace-thread-list");
  expect(list).toHaveClass("overflow-y-auto", "overscroll-contain", "px-0.5");
  expect(list).not.toContainElement(screen.getByRole("menuitem", { name: "新对话" }));
  expect(screen.getByRole("menuitem", { name: "对话 40" })).toBeInTheDocument();
});

test("opens a conversation-specific rename dialog from its row action", () => {
  renderHeader();
  fireEvent.pointerDown(screen.getByRole("button", { name: /对话/ }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole("menuitem", { name: "重命名“旧对话”" }));

  expect(screen.getByRole("dialog", { name: "重命名对话" })).toBeInTheDocument();
  const titleInput = screen.getByRole("textbox", { name: "对话标题" });
  expect(titleInput).toHaveAttribute("maxlength", "60");
  expect(titleInput).toHaveValue("旧对话");
  expect(document.querySelector('input[name="conversationId"]')).toHaveValue(olderConversationId);
  expect(titleInput).toHaveFocus();
});

test("confirms before deleting the conversation selected from its row action", () => {
  renderHeader();
  fireEvent.pointerDown(screen.getByRole("button", { name: /对话/ }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole("menuitem", { name: "删除“旧对话”" }));

  expect(screen.getByRole("alertdialog", { name: "删除对话" })).toBeInTheDocument();
  expect(screen.getByText(/删除“旧对话”/)).toBeInTheDocument();
  expect(document.querySelector('input[name="conversationId"]')).toHaveValue(olderConversationId);
  expect(screen.getByRole("button", { name: "删除" })).toHaveAttribute("type", "submit");
});
