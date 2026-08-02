import { expect, test, vi } from "vitest";
import { materializePresentationDraftEvent } from "./draft-preview.server";

const encode = (value: string) => new TextEncoder().encode(value);
const manifest = (pages: string[]) =>
  `size: [1280, 720]\npages:\n${pages.map((page) => `  - ${page}`).join("\n")}\n`;
const pageProgress = (pagePath: string) => ({
  operation: "generated" as const,
  pagePath,
  phase: "pptd" as const,
  status: "progress" as const,
  version: 1 as const,
});

test("materializes the generated page against the fixed native PPTD entrypoint", async () => {
  const files = new Map([
    [
      "/workspace/attempt/out/presentation/presentation.pptd",
      encode(manifest(["pages/01-cover.page", "pages/02-body.page"])),
    ],
    [
      "/workspace/attempt/out/presentation/pages/02-body.page",
      encode("pageType: content\nelements: []\n"),
    ],
  ]);
  const downloadFile = vi.fn(async (path: string) => {
    const body = files.get(path);
    if (!body) throw new Error("missing");
    return body;
  });

  const events = await materializePresentationDraftEvent({
    deliveredPagePaths: ["pages/01-cover.page"],
    downloadFile,
    isInitialEvent: true,
    progress: pageProgress("pages/02-body.page"),
    workspacePath: "/workspace/attempt",
  });

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    event: "page_updated",
    pageNumber: 2,
    pagePath: "pages/02-body.page",
    pptdContent: manifest(["pages/01-cover.page", "pages/02-body.page"]),
    totalPages: 2,
  });
  expect(downloadFile.mock.calls.map(([path]) => path)).toEqual([
    "/workspace/attempt/out/presentation/presentation.pptd",
    "/workspace/attempt/out/presentation/pages/02-body.page",
  ]);
});

test("derives the page number and total from the manifest, not the marker", async () => {
  const downloadFile = vi.fn(async (path: string) =>
    encode(
      path.endsWith(".pptd")
        ? manifest(["pages/01-cover.page", "pages/02-body.page", "pages/03-end.page"])
        : "pageType: content\nelements: []\n",
    ),
  );

  const events = await materializePresentationDraftEvent({
    deliveredPagePaths: ["pages/01-cover.page", "pages/03-end.page"],
    downloadFile,
    isInitialEvent: false,
    progress: pageProgress("pages/02-body.page"),
    workspacePath: "/workspace/attempt",
  });

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ pageNumber: 2, totalPages: 3 });
});

test("skips a page that is not listed in the manifest", async () => {
  const downloadFile = vi.fn(async () => encode(manifest(["pages/01-cover.page"])));
  await expect(
    materializePresentationDraftEvent({
      deliveredPagePaths: ["pages/01-cover.page"],
      downloadFile,
      isInitialEvent: true,
      progress: pageProgress("pages/unknown.page"),
      workspacePath: "/workspace/attempt",
    }),
  ).resolves.toEqual([]);
});

test("matches a manifest entry whose spelling differs trivially", async () => {
  const downloadFile = vi.fn(async (path: string) =>
    encode(
      path.endsWith(".pptd") ? manifest(["./pages/cover.page"]) : "pageType: cover\nelements: []",
    ),
  );

  const events = await materializePresentationDraftEvent({
    deliveredPagePaths: [],
    downloadFile,
    isInitialEvent: true,
    progress: pageProgress("pages/cover.page"),
    workspacePath: "/workspace/attempt",
  });

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ pageNumber: 1, pagePath: "./pages/cover.page", totalPages: 1 });
});

test("omits the stable PPTD manifest after the initial stream event", async () => {
  const downloadFile = vi.fn(async (path: string) =>
    encode(
      path.endsWith(".pptd") ? manifest(["pages/cover.page"]) : "pageType: cover\nelements: []",
    ),
  );

  const events = await materializePresentationDraftEvent({
    deliveredPagePaths: [],
    downloadFile,
    isInitialEvent: false,
    progress: pageProgress("pages/cover.page"),
    workspacePath: "/workspace/attempt",
  });

  expect(events).toHaveLength(1);
  expect(events[0]).not.toHaveProperty("pptdContent");
});

test("recovers a page that was not delivered on an earlier event", async () => {
  const files = new Map([
    [
      "/workspace/attempt/out/presentation/presentation.pptd",
      encode(manifest(["pages/one.page", "pages/two.page"])),
    ],
    [
      "/workspace/attempt/out/presentation/pages/one.page",
      encode("pageType: content\nelements: []\n"),
    ],
    [
      "/workspace/attempt/out/presentation/pages/two.page",
      encode("pageType: content\nelements: []\n"),
    ],
  ]);
  const downloadFile = vi.fn(async (path: string) => {
    const body = files.get(path);
    if (!body) throw new Error("missing");
    return body;
  });

  // The reported page is redelivered and a page that was never delivered (for
  // example one fixed by a tool the progress hook does not observe) is
  // recovered alongside it, so a single failed report never strands a page.
  const events = await materializePresentationDraftEvent({
    deliveredPagePaths: ["pages/one.page"],
    downloadFile,
    isInitialEvent: false,
    progress: pageProgress("pages/one.page"),
    workspacePath: "/workspace/attempt",
  });

  expect(events.map((event) => event.pagePath)).toEqual(["pages/one.page", "pages/two.page"]);
});

test("waits for local image assets referenced by a page before publishing progress", async () => {
  const downloadFile = vi.fn(async (path: string) => {
    if (path.endsWith(".pptd")) return encode(manifest(["pages/cover.page"]));
    if (path.endsWith("cover.page")) {
      return encode(`
pageType: cover
elements:
  - elementId: hero
    elementType: image
    bounds: [0, 0, 1280, 720]
    src: images/hero.png
`);
    }
    if (path.endsWith("images/hero.png")) return new Uint8Array([1, 2, 3]);
    throw new Error("missing");
  });

  await materializePresentationDraftEvent({
    deliveredPagePaths: [],
    downloadFile,
    isInitialEvent: true,
    progress: pageProgress("pages/cover.page"),
    workspacePath: "/workspace/attempt",
  });

  expect(downloadFile).toHaveBeenCalledWith(
    "/workspace/attempt/out/presentation/images/hero.png",
    expect.any(Number),
  );
});

test("does not download remote or embedded images from the workspace", async () => {
  const downloadFile = vi.fn(async (path: string) => {
    if (path.endsWith(".pptd")) return encode(manifest(["pages/cover.page"]));
    if (path.endsWith("cover.page")) {
      return encode(`
pageType: cover
elements:
  - { elementId: remote, elementType: image, bounds: [0, 0, 10, 10], src: https://cdn.example/hero.png }
  - { elementId: embedded, elementType: image, bounds: [0, 0, 10, 10], src: "data:image/png;base64,aGVsbG8=" }
`);
    }
    throw new Error(`unexpected download: ${path}`);
  });

  const events = await materializePresentationDraftEvent({
    deliveredPagePaths: [],
    downloadFile,
    isInitialEvent: true,
    progress: pageProgress("pages/cover.page"),
    workspacePath: "/workspace/attempt",
  });

  expect(events).toHaveLength(1);
  expect(downloadFile).toHaveBeenCalledTimes(2);
});
