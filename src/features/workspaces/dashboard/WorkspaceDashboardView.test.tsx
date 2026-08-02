import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { renderWithIntl } from "../../../../tests/render";
import type { Workspace } from "../types";
import type { WorkspaceArchiveFormAction, WorkspaceRenameFormAction } from "./types";
import { WorkspaceDashboardView } from "./WorkspaceDashboardView";

const workspaces: Workspace[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    ownerId: "owner-id",
    ownerHandle: "developer",
    slug: null,
    name: "生物知识库",
    visibility: "private",
    archivedAt: null,
    createdAt: "2026-07-14T00:00:00Z",
    updatedAt: "2026-07-14T00:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    ownerId: "owner-id",
    ownerHandle: "developer",
    slug: "materials",
    name: "材料实验记录",
    visibility: "public",
    archivedAt: null,
    createdAt: "2026-07-13T00:00:00Z",
    updatedAt: "2026-07-16T00:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    ownerId: "owner-id",
    ownerHandle: "developer",
    slug: "archive",
    name: "旧课程资料",
    visibility: "private",
    archivedAt: "2026-07-16T00:00:00Z",
    createdAt: "2026-07-12T00:00:00Z",
    updatedAt: "2026-07-16T00:00:00Z",
  },
];

const archiveAction: WorkspaceArchiveFormAction = async () => null;
const renameAction: WorkspaceRenameFormAction = async () => null;

function renderDashboard(
  options: {
    archiveAction?: WorkspaceArchiveFormAction;
    renameAction?: WorkspaceRenameFormAction;
    workspaces?: readonly Workspace[];
  } = {},
) {
  return renderWithIntl(
    <WorkspaceDashboardView
      accountMenu={<span>账户菜单</span>}
      archiveAction={options.archiveAction ?? archiveAction}
      now="2026-07-17T12:00:00Z"
      renameAction={options.renameAction ?? renameAction}
      workspaces={options.workspaces ?? workspaces}
    />,
  );
}

test("renders a real dashboard with one create entry and active workspaces ordered by update time", () => {
  renderDashboard();

  expect(screen.getByRole("heading", { name: "工作空间", level: 1 })).toBeInTheDocument();
  expect(screen.queryByText("精选工作空间")).not.toBeInTheDocument();
  expect(screen.queryByText("全部")).not.toBeInTheDocument();
  expect(screen.queryByText("旧课程资料")).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "新建" })).toHaveLength(1);

  const workspaceLinks = screen.getAllByRole("link", { name: /^打开 / });
  expect(workspaceLinks.map((link) => link.getAttribute("aria-label"))).toEqual([
    "打开 材料实验记录",
    "打开 生物知识库",
  ]);
  expect(screen.getByRole("link", { name: "打开 材料实验记录" })).toHaveAttribute(
    "href",
    "/developer/materials",
  );
});

test("searches names and addresses, switches views, and filters archived workspaces", () => {
  renderDashboard();

  fireEvent.change(screen.getByRole("searchbox", { name: "搜索工作空间" }), {
    target: { value: "materials" },
  });
  expect(screen.queryByText("生物知识库")).not.toBeInTheDocument();
  expect(screen.getByText("材料实验记录")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "列表视图" }));
  expect(screen.getByRole("button", { name: "列表视图" })).toHaveAttribute("aria-pressed", "true");

  fireEvent.change(screen.getByRole("searchbox", { name: "搜索工作空间" }), {
    target: { value: "" },
  });
  fireEvent.pointerDown(screen.getByRole("button", { name: /筛选/ }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole("menuitemradio", { name: "已归档" }));
  expect(screen.getByText("旧课程资料")).toBeInTheDocument();
  expect(screen.queryByText("材料实验记录")).not.toBeInTheDocument();
});

test("sorts by oldest update and name without changing the server data", () => {
  const [first, second] = workspaces;
  if (!first || !second) throw new Error("Dashboard fixture is incomplete");
  const sortable = [
    { ...first, name: "Zulu", updatedAt: "2026-07-14T00:00:00Z" },
    { ...second, name: "Beta", updatedAt: "2026-07-16T00:00:00Z" },
    {
      ...first,
      id: "00000000-0000-4000-8000-000000000004",
      name: "Alpha",
      updatedAt: "2026-07-15T00:00:00Z",
    },
  ];
  renderDashboard({ workspaces: sortable });

  expect(screen.getAllByRole("link", { name: /^打开 / })[0]).toHaveAccessibleName("打开 Beta");
  fireEvent.pointerDown(screen.getByRole("button", { name: /筛选/ }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole("menuitemradio", { name: "最早更新" }));
  expect(screen.getAllByRole("link", { name: /^打开 / })[0]).toHaveAccessibleName("打开 Zulu");

  fireEvent.pointerDown(screen.getByRole("button", { name: /筛选/ }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole("menuitemradio", { name: "名称 A–Z" }));
  expect(screen.getAllByRole("link", { name: /^打开 / })[0]).toHaveAccessibleName("打开 Alpha");
});

test("exposes rename and archive actions on each workspace instead of a disabled menu", () => {
  const archiveSpy = vi.fn<WorkspaceArchiveFormAction>(async () => null);
  renderDashboard({ archiveAction: archiveSpy });

  fireEvent.pointerDown(screen.getByRole("button", { name: "材料实验记录 的操作" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole("menuitem", { name: "重命名" }));

  const dialog = screen.getByRole("dialog", { name: "重命名工作空间" });
  expect(within(dialog).getByRole("textbox", { name: "工作空间名称" })).toHaveValue("材料实验记录");
  expect(within(dialog).queryByDisplayValue("materials")).not.toBeInTheDocument();
});

test("submits the selected workspace and archive operation", async () => {
  const archiveSpy = vi.fn<WorkspaceArchiveFormAction>(async () => null);
  renderDashboard({ archiveAction: archiveSpy });

  fireEvent.pointerDown(screen.getByRole("button", { name: "材料实验记录 的操作" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole("menuitem", { name: "归档" }));

  await waitFor(() => expect(archiveSpy).toHaveBeenCalledOnce());
  const submitted = archiveSpy.mock.calls[0]?.[1];
  expect(submitted?.get("workspaceId")).toBe("00000000-0000-4000-8000-000000000002");
  expect(submitted?.get("operation")).toBe("archive");
});

test("closes the rename dialog and announces a successful rename", async () => {
  const successfulRename: WorkspaceRenameFormAction = async (_state, formData) => ({
    status: "success",
    workspaceName: String(formData.get("name")),
  });
  renderDashboard({ renameAction: successfulRename });

  fireEvent.pointerDown(screen.getByRole("button", { name: "材料实验记录 的操作" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole("menuitem", { name: "重命名" }));
  fireEvent.change(screen.getByRole("textbox", { name: "工作空间名称" }), {
    target: { value: "新名称" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("status")).toHaveTextContent("已重命名为“新名称”。");
});

test("shows distinct empty states for first use, archived workspaces, and search misses", () => {
  const { rerender } = renderDashboard({ workspaces: [] });
  expect(screen.getByText("开启您的 Spectra 之旅")).toBeInTheDocument();

  rerender(
    <WorkspaceDashboardView
      accountMenu={<span>账户菜单</span>}
      archiveAction={archiveAction}
      now="2026-07-17T12:00:00Z"
      renameAction={renameAction}
      workspaces={workspaces.slice(0, 2)}
    />,
  );
  fireEvent.pointerDown(screen.getByRole("button", { name: /筛选/ }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole("menuitemradio", { name: "已归档" }));
  expect(screen.getByText("没有已归档的工作空间")).toBeInTheDocument();
});
