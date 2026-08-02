import sharp from "sharp";
import { expect, test } from "vitest";
import {
  deterministicPresentationSourceArchive,
  extractPresentationPptdAssets,
  extractPresentationPptdSource,
  inspectPresentationSourceArchive,
  readPresentationSourceArchive,
  runPresentationPipeline,
} from "./pipeline.server";

test("normalizes source bundles independent of input order", async () => {
  const first = await deterministicPresentationSourceArchive([
    { body: new TextEncoder().encode("page"), path: "deck/pages/1.page" },
    { body: new TextEncoder().encode("project"), path: "deck/deck.pptd" },
  ]);
  const second = await deterministicPresentationSourceArchive([
    { body: new TextEncoder().encode("project"), path: "deck/deck.pptd" },
    { body: new TextEncoder().encode("page"), path: "deck/pages/1.page" },
  ]);
  expect(first).toEqual(second);
  expect((await readPresentationSourceArchive(first)).map((file) => file.path)).toEqual([
    "out/deck/deck.pptd",
    "out/deck/pages/1.page",
  ]);
});

test("rejects unsafe archive paths", async () => {
  await expect(
    deterministicPresentationSourceArchive([
      { body: new Uint8Array([1]), path: "../outside.pptd" },
    ]),
  ).rejects.toThrow("presentation_source_archive_unsafe");
});

test("publishes a nested PPTD project without a binary render", async () => {
  const encode = (value: string) => new TextEncoder().encode(value);
  const archive = await deterministicPresentationSourceArchive([
    {
      body: encode(
        ["title: 课程", "size: [1280, 720]", "theme: {}", "pages:", "  - pages/01-cover.page"].join(
          "\n",
        ),
      ),
      path: "lesson/lesson.pptd",
    },
    {
      body: encode(
        [
          "pageType: cover",
          "elements:",
          "  - elementId: cover-title",
          "    elementType: text",
          "    content:",
          '      style: "$coverTitle"',
          "      text: <p>课程封面</p>",
        ].join("\n"),
      ),
      path: "lesson/pages/01-cover.page",
    },
  ]);

  const result = await runPresentationPipeline({ archive, summary: "摘要" });

  expect(result.content).toEqual({
    schemaVersion: 1,
    pageCount: 1,
    pageTitles: ["课程封面"],
    summary: "摘要",
    title: "课程",
  });
  expect(
    (await readPresentationSourceArchive(result.sourceArchive)).map((file) => file.path),
  ).toEqual(["out/lesson/lesson.pptd", "out/lesson/pages/01-cover.page"]);
});

test("uses the page filename when the page has no title element", async () => {
  const encode = (value: string) => new TextEncoder().encode(value);
  const archive = await deterministicPresentationSourceArchive([
    {
      body: encode("title: Native Skill Output\npages:\n  - pages/02-key-idea.page\n"),
      path: "deck/deck.pptd",
    },
    {
      body: encode("pageType: content\nelements: []\n"),
      path: "deck/pages/02-key-idea.page",
    },
  ]);

  const result = await runPresentationPipeline({ archive, summary: "Original request" });

  expect(result.content.pageTitles).toEqual(["key idea"]);
  expect(result.content.summary).toBe("Original request");
});

test("rejects unsafe page paths", async () => {
  const encode = (value: string) => new TextEncoder().encode(value);
  const archive = await deterministicPresentationSourceArchive([
    {
      body: encode("title: Unsafe\npages:\n  - ../outside.page\n"),
      path: "deck/deck.pptd",
    },
  ]);

  await expect(runPresentationPipeline({ archive, summary: "request" })).rejects.toThrow(
    "presentation_page_path_unsafe",
  );
});

test("rejects ambiguous presentation projects", async () => {
  const encode = (value: string) => new TextEncoder().encode(value);
  const archive = await deterministicPresentationSourceArchive([
    { body: encode("pages: [pages/one.page]"), path: "one/one.pptd" },
    { body: encode("pages: [pages/two.page]"), path: "two/two.pptd" },
  ]);

  await expect(inspectPresentationSourceArchive(archive)).rejects.toThrow(
    "presentation_entrypoint_ambiguous",
  );
});

test("finds the PPTD entrypoint before the deterministic PPTX conversion", async () => {
  const encode = (value: string) => new TextEncoder().encode(value);
  const archive = await deterministicPresentationSourceArchive([
    { body: encode("pages: [pages/one.page]"), path: "deck/deck.pptd" },
    { body: encode("pageType: content\nelements: []"), path: "deck/pages/one.page" },
  ]);

  expect((await inspectPresentationSourceArchive(archive)).entrypoint).toBe("deck/deck.pptd");
});

test("rejects invalid PPTD YAML during the final pipeline", async () => {
  const encode = (value: string) => new TextEncoder().encode(value);
  const archive = await deterministicPresentationSourceArchive([
    { body: encode("pages: ["), path: "deck.pptd" },
  ]);

  await expect(runPresentationPipeline({ archive, summary: "request" })).rejects.toThrow(
    "presentation_pptd_invalid",
  );
});

test("drops the rendered PPTX instead of failing the delivery", async () => {
  const encode = (value: string) => new TextEncoder().encode(value);
  const archive = await deterministicPresentationSourceArchive([
    { body: encode("pages: [pages/one.page]"), path: "deck/deck.pptd" },
    { body: encode("pageType: content\nelements: []"), path: "deck/pages/one.page" },
    { body: new Uint8Array([1, 2, 3]), path: "deck/deck.pptx" },
  ]);

  const result = await runPresentationPipeline({ archive, summary: "request" });

  expect(
    (await readPresentationSourceArchive(result.sourceArchive)).map((file) => file.path),
  ).toEqual(["out/deck/deck.pptd", "out/deck/pages/one.page"]);
  expect(result.sourceManifest.files.map((file) => file.path)).toEqual([
    "out/deck/deck.pptd",
    "out/deck/pages/one.page",
  ]);
});

test("splits a source archive into entrypoint content and a page map keyed by page reference", async () => {
  const encode = (value: string) => new TextEncoder().encode(value);
  const pptd = [
    "title: 课程",
    "size: [1280, 720]",
    "theme: {}",
    "pages:",
    "  - pages/01-cover.page",
    "  - pages/02-body.page",
  ].join("\n");
  const cover = "pageType: cover\nelements: []\n";
  const body = "pageType: content\nelements: []\n";
  const archive = await deterministicPresentationSourceArchive([
    { body: encode(pptd), path: "lesson/lesson.pptd" },
    { body: encode(cover), path: "lesson/pages/01-cover.page" },
    { body: encode(body), path: "lesson/pages/02-body.page" },
  ]);

  const source = extractPresentationPptdSource(await readPresentationSourceArchive(archive));

  expect(source.pptdContent).toBe(pptd);
  expect(source.pageMap).toEqual({
    "pages/01-cover.page": cover,
    "pages/02-body.page": body,
  });
});

test("rejects a source archive missing a referenced page", async () => {
  const encode = (value: string) => new TextEncoder().encode(value);
  const archive = await deterministicPresentationSourceArchive([
    { body: encode("pages: [pages/missing.page]"), path: "deck/deck.pptd" },
  ]);
  const files = await readPresentationSourceArchive(archive);

  expect(() => extractPresentationPptdSource(files)).toThrow("presentation_page_missing");
});

test("resolves project-relative PPTD images as self-contained data URLs", async () => {
  const encode = (value: string) => new TextEncoder().encode(value);
  const png = new Uint8Array(
    await sharp({
      create: { background: "#ff0000", channels: 4, height: 1, width: 1 },
    })
      .png()
      .toBuffer(),
  );
  const archive = await deterministicPresentationSourceArchive([
    { body: encode("pages: [pages/cover.page]"), path: "deck/deck.pptd" },
    { body: encode("pageType: cover\nelements: []"), path: "deck/pages/cover.page" },
    { body: png, path: "deck/images/cover.png" },
    { body: encode("not a png"), path: "deck/images/fake.png" },
    { body: png.slice(0, 40), path: "deck/images/truncated.png" },
    { body: encode("not an image"), path: "deck/data/value.txt" },
  ]);
  const files = await readPresentationSourceArchive(archive);

  expect(
    await extractPresentationPptdAssets(files, [
      "/images/cover.png",
      "/images/fake.png",
      "/images/truncated.png",
      "images/missing.png",
      "../outside.png",
      "data/value.txt",
    ]),
  ).toEqual([
    `data:image/png;base64,${Buffer.from(png).toString("base64")}`,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
});

test("rejects repeated PPTD asset paths before encoding", async () => {
  const encode = (value: string) => new TextEncoder().encode(value);
  const archive = await deterministicPresentationSourceArchive([
    { body: encode("pages: [pages/cover.page]"), path: "deck/deck.pptd" },
    { body: encode("pageType: cover\nelements: []"), path: "deck/pages/cover.page" },
  ]);

  await expect(
    extractPresentationPptdAssets(await readPresentationSourceArchive(archive), [
      "/images/cover.png",
      "images/./cover.png",
    ]),
  ).rejects.toThrow("presentation_editor_asset_path_conflict");
});
