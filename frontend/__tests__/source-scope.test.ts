import { resolveReadySelectedFileIds } from "@/stores/project-store/source-scope";

describe("resolveReadySelectedFileIds", () => {
  it("keeps only ready files from the current file list", () => {
    const files = [
      { id: "f-ready-1", status: "ready" },
      { id: "f-uploading", status: "uploading" },
      { id: "f-ready-2", status: "ready" },
    ] as const;

    expect(
      resolveReadySelectedFileIds(
        files as unknown as Parameters<typeof resolveReadySelectedFileIds>[0],
        ["f-ready-1", "f-uploading", "missing", "f-ready-2"]
      )
    ).toEqual(["f-ready-1", "f-ready-2"]);
  });

  it("returns empty when the selection is stale", () => {
    const files = [{ id: "current-project-file", status: "ready" }] as const;

    expect(
      resolveReadySelectedFileIds(
        files as unknown as Parameters<typeof resolveReadySelectedFileIds>[0],
        ["other-project-file"]
      )
    ).toEqual([]);
  });
});
