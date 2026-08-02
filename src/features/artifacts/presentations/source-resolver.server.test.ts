import { expect, test } from "vitest";
import { mergePresentationEditorSourceWithAncestor } from "./source-resolver.server";

const text = (value: string) => new TextEncoder().encode(value);

test("merges an editor snapshot while removing deleted pages and assets", () => {
  const files = mergePresentationEditorSourceWithAncestor({
    ancestorFiles: [
      {
        body: text("pages: [pages/keep.page, pages/delete.page]"),
        path: "out/deck.pptd",
      },
      { body: text("keep"), path: "out/pages/keep.page" },
      { body: text("delete"), path: "out/pages/delete.page" },
      { body: new Uint8Array([1]), path: "out/images/keep.png" },
      { body: new Uint8Array([2]), path: "out/images/delete.png" },
    ],
    entrypoint: "out/deck.pptd",
    snapshotSource: {
      pageMap: { "pages/keep.page": "keep revised\nimage: images/keep.png" },
      pptdContent: "pages: [pages/keep.page]\n",
    },
  });

  expect(files.map((file) => file.path)).toEqual([
    "out/deck.pptd",
    "out/pages/keep.page",
    "out/images/keep.png",
  ]);
});
