import { expect, test } from "vitest";
import { validatePresentationFocus } from "./refine";

const revisionId = "00000000-0000-4000-8000-000000000001";
const content = {
  pageCount: 2,
  pageTitles: ["Cover", "Detail"],
  schemaVersion: 1 as const,
  summary: "Summary",
  title: "Deck",
};

test("keeps selected slide indexes inside the current revision", () => {
  expect(
    validatePresentationFocus(content, {
      kind: "presentation_slides",
      revisionId,
      slideIndexes: [1],
    }),
  ).toEqual({ kind: "presentation_slides", revisionId, slideIndexes: [1] });
  expect(
    validatePresentationFocus(content, {
      kind: "presentation_slides",
      revisionId,
      slideIndexes: [2],
    }),
  ).toBeNull();
});
