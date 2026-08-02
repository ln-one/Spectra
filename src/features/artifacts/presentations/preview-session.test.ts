import { expect, test } from "vitest";
import { presentationPreviewUpdate } from "./preview-session";

const first = {
  pageMap: { "pages/1.page": "first" },
  pptdContent: "size: [1280, 720]\npages: [pages/1.page, pages/2.page]",
  totalPages: 2,
};

test("initializes a preview session with the manifest and every available page", () => {
  expect(presentationPreviewUpdate(null, {}, first)).toEqual({
    pageMap: first.pageMap,
    pptdContent: first.pptdContent,
  });
});

test("sends only pages that changed after the initial preview", () => {
  const next = {
    ...first,
    pageMap: {
      "pages/1.page": "first",
      "pages/2.page": "second",
    },
  };
  expect(presentationPreviewUpdate(first.pptdContent, first.pageMap, next)).toEqual({
    pageMap: { "pages/2.page": "second" },
    pptdContent: undefined,
  });
  expect(presentationPreviewUpdate(next.pptdContent, next.pageMap, next)).toBeNull();
});
