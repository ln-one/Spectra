import { StrictMode } from "react";
import { expect, test, vi } from "vitest";
import { renderWithIntl } from "../../../../tests/render";
import type { SourceClientActions } from "../client-actions";
import { resolveSourceUploadUrl, useSourceUploader } from "./useSourceUploader";

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

test("resolves a same-origin upload proxy URL for Uppy", () => {
  expect(
    resolveSourceUploadUrl(
      "/api/sources/00000000-0000-4000-8000-000000000612/upload?generation=1",
      "https://spectra.example.test",
    ),
  ).toBe(
    "https://spectra.example.test/api/sources/00000000-0000-4000-8000-000000000612/upload?generation=1",
  );
});

test("preserves an absolute object-storage upload URL", () => {
  expect(
    resolveSourceUploadUrl(
      "http://127.0.0.1:7070/spectra-dev/staging/source?signature=test",
      "https://spectra.example.test",
    ),
  ).toBe("http://127.0.0.1:7070/spectra-dev/staging/source?signature=test");
});

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
