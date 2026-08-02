import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { renderWithIntl } from "../../../../tests/render";
import type { WorkspaceInviteSearchAction, WorkspaceSharingFormAction } from "./types";
import { WorkspaceShareDialog } from "./WorkspaceShareDialog";

const initialState = {
  canManage: true,
  firstSharedAt: "2026-07-28T00:00:00.000Z",
  members: [],
  referenceable: false,
  slug: "course-notes",
  visibility: "private" as const,
};

const emptySearch: WorkspaceInviteSearchAction = async () => ({ ok: true, candidates: [] });

test("explains the shared and private surfaces in the same workspace", () => {
  const action: WorkspaceSharingFormAction = async (state) => state;
  renderWithIntl(
    <WorkspaceShareDialog
      action={action}
      initialState={initialState}
      ownerHandle="teacher"
      searchAction={emptySearch}
      workspaceId="00000000-0000-4000-8000-000000000001"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "分享" }));

  expect(screen.getByRole("dialog", { name: "分享工作空间" })).toBeInTheDocument();
  expect(screen.getByText("共享仅包含资料来源，不包括对话、历史和个人创作。")).toBeVisible();
});

test("submits a fixed access grant by registered identity", async () => {
  const action = vi.fn<WorkspaceSharingFormAction>().mockImplementation(async (state) => state);
  renderWithIntl(
    <WorkspaceShareDialog
      action={action}
      initialState={initialState}
      ownerHandle="teacher"
      searchAction={emptySearch}
      workspaceId="00000000-0000-4000-8000-000000000001"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "分享" }));
  fireEvent.change(screen.getByPlaceholderText("搜索用户名或邮箱"), {
    target: { value: "student@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "授权" }));

  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  const submitted = action.mock.calls[0]?.[1];
  expect(submitted?.get("intent")).toBe("invite");
  expect(submitted?.get("identity")).toBe("student@example.com");
});

test("a user without sharing management can inspect and copy but cannot grant access", () => {
  const action: WorkspaceSharingFormAction = async (state) => state;
  renderWithIntl(
    <WorkspaceShareDialog
      action={action}
      initialState={{ ...initialState, canManage: false, visibility: "public" }}
      ownerHandle="teacher"
      searchAction={emptySearch}
      workspaceId="00000000-0000-4000-8000-000000000001"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "分享" }));

  expect(screen.queryByPlaceholderText("搜索用户名或邮箱")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "公开" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "允许" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "复制链接" })).toBeVisible();
});

test("keeps visibility and referenceability as independent capsule settings", async () => {
  const action = vi
    .fn<WorkspaceSharingFormAction>()
    .mockImplementation(async (state, formData) => ({
      code: null,
      data: {
        ...state.data,
        ...(formData.get("intent") === "visibility"
          ? { visibility: formData.get("visibility") === "public" ? "public" : "private" }
          : { referenceable: formData.get("referenceable") === "true" }),
      },
    }));
  renderWithIntl(
    <WorkspaceShareDialog
      action={action}
      initialState={initialState}
      ownerHandle="teacher"
      searchAction={emptySearch}
      workspaceId="00000000-0000-4000-8000-000000000001"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "分享" }));
  const publicVisibility = screen.getByRole("button", { name: "公开" });
  const allowReferences = screen.getByRole("button", { name: "允许" });
  expect(screen.getByText("资料引用").compareDocumentPosition(screen.getByText("访问范围"))).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  expect(publicVisibility).toHaveAttribute("aria-pressed", "false");
  expect(allowReferences).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("button", { name: "复制链接" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("combobox")).toEqual([
    screen.getByRole("combobox", { name: "搜索要授权的用户" }),
  ]);
  fireEvent.click(publicVisibility);

  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  expect(action.mock.calls[0]?.[1].get("visibility")).toBe("public");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "公开" })).toHaveAttribute("aria-pressed", "true"),
  );
  expect(screen.getByRole("button", { name: "复制链接" })).toBeVisible();

  fireEvent.click(allowReferences);
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  expect(action.mock.calls[1]?.[1].get("referenceable")).toBe("true");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "允许" })).toHaveAttribute("aria-pressed", "true"),
  );
});

test("lets a legacy addressless workspace turn off referenceability", async () => {
  const action = vi
    .fn<WorkspaceSharingFormAction>()
    .mockImplementation(async (state, formData) => ({
      code: null,
      data: {
        ...state.data,
        referenceable: formData.get("referenceable") === "true",
      },
    }));
  renderWithIntl(
    <WorkspaceShareDialog
      action={action}
      initialState={{ ...initialState, referenceable: true, slug: null }}
      ownerHandle="teacher"
      searchAction={emptySearch}
      workspaceId="00000000-0000-4000-8000-000000000001"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "分享" }));
  expect(screen.getByRole("textbox", { name: "先建立分享地址" })).toBeVisible();
  expect(screen.getByRole("button", { name: "允许" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "关闭" }));

  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  expect(action.mock.calls[0]?.[1].get("referenceable")).toBe("false");
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "允许" })).not.toBeInTheDocument(),
  );
});

test("searches registered users and grants the selected candidate", async () => {
  const action = vi.fn<WorkspaceSharingFormAction>().mockImplementation(async (state) => state);
  const searchAction = vi.fn<WorkspaceInviteSearchAction>().mockResolvedValue({
    ok: true,
    candidates: [
      {
        principalId: "00000000-0000-4000-8000-000000000002",
        handle: "student",
        email: "student@example.com",
      },
    ],
  });
  renderWithIntl(
    <WorkspaceShareDialog
      action={action}
      initialState={initialState}
      ownerHandle="teacher"
      searchAction={searchAction}
      workspaceId="00000000-0000-4000-8000-000000000001"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "分享" }));
  fireEvent.change(screen.getByRole("combobox", { name: "搜索要授权的用户" }), {
    target: { value: "stu" },
  });

  const candidate = await screen.findByRole("option", { name: /@student/ });
  expect(searchAction).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001", "stu");
  fireEvent.click(candidate);
  fireEvent.click(screen.getByRole("button", { name: "授权" }));

  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  expect(action.mock.calls[0]?.[1].get("identity")).toBe("student");
});
