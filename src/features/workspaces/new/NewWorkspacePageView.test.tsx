import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderWithIntl } from "../../../../tests/render";
import { NewWorkspacePageView } from "./NewWorkspacePageView";
import type { CreateWorkspaceFormAction } from "./types";

const createAction: CreateWorkspaceFormAction = async () => null;

test("preserves the NeoSpectra creation-page shell while enabling workspace creation", () => {
  const { container } = renderWithIntl(<NewWorkspacePageView createAction={createAction} />);

  expect(screen.getByRole("link", { name: "返回工作台" })).toHaveAttribute("href", "/workspaces");
  expect(screen.getByRole("heading", { name: "开启您的智慧教学" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "教学构想" })).toBeRequired();
  expect(screen.getByRole("button", { name: "导入资料 (0)" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "导入资料库" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "开始创造" })).toBeEnabled();
  expect(container.querySelector('g[style*="mix-blend-mode: normal"]')).toBeInTheDocument();
});

test("keeps advanced placeholders static instead of storing fake Project state", () => {
  renderWithIntl(<NewWorkspacePageView createAction={createAction} />);

  expect(screen.getByText("更多自定义选项")).toBeInTheDocument();
  expect(screen.getByLabelText("项目名称 (可选)")).toBeEnabled();
  expect(screen.getByRole("button", { name: "初中" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "私有" })).toBeDisabled();
  expect(screen.getByRole("switch", { name: "允许被其他项目引用" })).toBeDisabled();
});
