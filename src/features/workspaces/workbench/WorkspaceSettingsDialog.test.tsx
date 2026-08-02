import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { renderWithIntl } from "../../../../tests/render";
import type { WorkspaceSettingsFormAction } from "./types";
import { WorkspaceSettingsDialog } from "./WorkspaceSettingsDialog";

const workspace = {
  id: "00000000-0000-4000-8000-000000000001",
  ownerId: "principal-id",
  ownerHandle: "developer",
  slug: "course-notes",
  name: "课程笔记",
  visibility: "private" as const,
  archivedAt: null,
  createdAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:00.000Z",
};

test("opens a focused settings form without creating client-owned workspace state", () => {
  const action: WorkspaceSettingsFormAction = async () => null;
  renderWithIntl(
    <WorkspaceSettingsDialog
      action={action}
      conversationId="00000000-0000-4000-8000-000000000002"
      workspace={workspace}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "工作空间设置" }));

  expect(screen.getByRole("dialog", { name: "工作空间设置" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "工作空间名称" })).toHaveValue("课程笔记");
  expect(screen.getByRole("textbox", { name: "自定义地址（可选）" })).toHaveValue("course-notes");
  expect(screen.queryByText("/developer/")).not.toBeInTheDocument();
  expect(screen.getByText("访问地址预览：/developer/course-notes")).toBeInTheDocument();
});

test("submits only the concrete settings fields", async () => {
  const action = vi.fn<WorkspaceSettingsFormAction>().mockResolvedValue(null);
  renderWithIntl(
    <WorkspaceSettingsDialog
      action={action}
      conversationId="00000000-0000-4000-8000-000000000002"
      workspace={workspace}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "工作空间设置" }));
  fireEvent.change(screen.getByRole("textbox", { name: "工作空间名称" }), {
    target: { value: "新名称" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "自定义地址（可选）" }), {
    target: { value: "new-address" },
  });
  expect(screen.getByText("访问地址预览：/developer/new-address")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  const submitted = action.mock.calls[0]?.[1];
  expect(submitted?.get("workspaceId")).toBe(workspace.id);
  expect(submitted?.get("name")).toBe("新名称");
  expect(submitted?.get("slug")).toBe("new-address");
  expect([...(submitted?.keys() ?? [])].sort()).toEqual([
    "conversationId",
    "name",
    "slug",
    "workspaceId",
  ]);
});
