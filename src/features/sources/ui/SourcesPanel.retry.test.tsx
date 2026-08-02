import { act, fireEvent, screen } from "@testing-library/react";
import { Uppy } from "@uppy/core";
import { afterEach, expect, test, vi } from "vitest";
import { renderWithIntl } from "../../../../tests/render";
import type { SourceClientActions } from "../client-actions";
import type { Source } from "../types";
import { SourcesPanel } from "./SourcesPanel";

const uploader = vi.hoisted(() => ({ current: undefined as Uppy | undefined }));

vi.mock("./useSourceUploader", () => ({
  useSourceUploader: () => {
    if (!uploader.current) throw new Error("Missing test uploader");
    return uploader.current;
  },
}));

const pendingSource: Source = {
  id: "0198ebec-17f0-7500-8000-000000000021",
  workspaceId: "0198ebec-17f0-7500-8000-000000000022",
  kind: "uploadedFile",
  originalFilename: "retry.pdf",
  sizeBytes: 1024,
  state: "pending_upload",
  failureCode: null,
  uploadGeneration: 1,
  uploadExpiresAt: "2026-07-15T00:15:00.000Z",
  ingestion: null,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
};

function sourceActions(): SourceClientActions {
  return {
    list: vi.fn().mockResolvedValue({ ok: true, data: [pendingSource] }),
    listReferenceCandidates: vi
      .fn()
      .mockResolvedValue({ ok: true, data: { candidates: [], totalOtherWorkspaces: 0 } }),
    resolveReferenceLocator: vi.fn(),
    addReference: vi.fn(),
    start: vi.fn(),
    prepare: vi.fn(),
    complete: vi.fn(),
    ingest: vi.fn(),
    remove: vi.fn(),
  };
}

afterEach(() => {
  uploader.current?.destroy();
});

test("retries the existing Uppy file without creating another Source", () => {
  const uppy = new Uppy();
  uploader.current = uppy;
  const fileId = uppy.addFile({
    name: "retry.pdf",
    type: "application/pdf",
    data: new File(["content"], "retry.pdf", { type: "application/pdf" }),
  });
  uppy.setFileMeta(fileId, { sourceId: pendingSource.id, uploadGeneration: 1 });
  uppy.setFileState(fileId, { error: "Network unavailable" });
  const retryUpload = vi.spyOn(uppy, "retryUpload").mockResolvedValue(undefined);
  const actions = sourceActions();

  renderWithIntl(
    <SourcesPanel
      actions={actions}
      initialSources={[pendingSource]}
      workspaceId={pendingSource.workspaceId}
    />,
  );

  expect(screen.getByText("上传失败，可重试")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重新上传 retry.pdf" }));

  expect(retryUpload).toHaveBeenCalledWith(fileId);
  expect(actions.start).not.toHaveBeenCalled();
});

test("keeps a restriction error visible when a later success notice arrives", () => {
  const uppy = new Uppy();
  uploader.current = uppy;

  renderWithIntl(
    <SourcesPanel
      actions={sourceActions()}
      initialSources={[]}
      workspaceId={pendingSource.workspaceId}
    />,
  );

  act(() => {
    uppy.info("只能上传支持的文件格式", "error", 60_000);
    uppy.info("1 file uploaded", "success", 60_000);
  });

  expect(screen.getByRole("alert")).toHaveTextContent("只能上传支持的文件格式");
  fireEvent.click(screen.getByRole("button", { name: "关闭上传错误" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
