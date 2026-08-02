import { StrictMode } from "react";
import { expect, test, vi } from "vitest";
import { renderWithIntl } from "../../../../tests/render";
import type { SourceClientActions } from "../client-actions";
import { useSourceUploader } from "./useSourceUploader";

function sourceActions(): SourceClientActions {
  return {
    list: vi.fn(),
    listReferenceCandidates: vi.fn(),
    resolveReferenceLocator: vi.fn(),
    addReference: vi.fn(),
    start: vi.fn(),
    prepare: vi.fn(),
    complete: vi.fn(),
    ingest: vi.fn(),
    remove: vi.fn(),
  };
}

test("keeps the upload plugin active after the Strict Mode effect replay", async () => {
  let uploader: ReturnType<typeof useSourceUploader> | undefined;

  function Probe() {
    uploader = useSourceUploader({
      actions: sourceActions(),
      actionFailedMessage: "Upload failed",
      errorMessage: () => "Upload failed",
      queryKey: ["workspace", "workspace-1", "sources"],
      workspaceId: "workspace-1",
    });
    return null;
  }

  const view = renderWithIntl(
    <StrictMode>
      <Probe />
    </StrictMode>,
  );
  await Promise.resolve();

  expect(uploader?.getPlugin("AwsS3Multipart")).toBeDefined();

  view.unmount();
  await Promise.resolve();
  expect(uploader?.getPlugin("AwsS3Multipart")).toBeUndefined();
});
