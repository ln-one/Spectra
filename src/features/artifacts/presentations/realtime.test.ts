import { expect, test } from "vitest";
import { applyPresentationDraftEvent, type PresentationDraftEvent } from "./realtime";
import { presentationDetailSchema } from "./types";

const attemptId = "00000000-0000-4000-8000-000000000001";
const manifest = "size: [1280, 720]\npages: [pages/1.page, pages/2.page]";

function failedDetail() {
  return presentationDetailSchema.parse({
    artifact: null,
    createdAt: "2026-07-29T00:00:00.000Z",
    failureCode: "presentation_remote_error",
    generationAttemptId: attemptId,
    generationDraft: { phase: "failed", schemaVersion: 1 },
    generationSequence: 4,
    generationState: "failed",
    id: "00000000-0000-4000-8000-000000000002",
    kind: "presentation",
    title: "Replay",
    updatedAt: "2026-07-29T00:00:00.000Z",
    workspaceId: "00000000-0000-4000-8000-000000000003",
  });
}

function event(overrides: Partial<PresentationDraftEvent> = {}): PresentationDraftEvent {
  return {
    event: "page_updated",
    kind: "presentation",
    pageContent: "pageType: content\nelements: []",
    pageNumber: 1,
    pagePath: "pages/1.page",
    pptdContent: manifest,
    sequence: 1_001,
    totalPages: 2,
    version: 1,
    ...overrides,
  };
}

test("rebuilds failed Presentation previews from the closed attempt stream", () => {
  const first = applyPresentationDraftEvent(failedDetail(), event());
  const second = applyPresentationDraftEvent(
    first,
    event({
      pageNumber: 2,
      pagePath: "pages/2.page",
      pptdContent: undefined,
      sequence: 1_002,
    }),
  );
  expect(second).toMatchObject({
    generationDraft: {
      phase: "failed",
      preview: {
        pageMap: {
          "pages/1.page": "pageType: content\nelements: []",
          "pages/2.page": "pageType: content\nelements: []",
        },
        pptdContent: manifest,
        totalPages: 2,
      },
    },
    generationSequence: 1_002,
    generationState: "failed",
  });
});

test("ignores duplicate and out-of-order Presentation page events", () => {
  const detail = applyPresentationDraftEvent(failedDetail(), event());
  expect(applyPresentationDraftEvent(detail, event({ sequence: 1_001 }))).toBe(detail);
  expect(applyPresentationDraftEvent(detail, event({ sequence: 1_000 }))).toBe(detail);
});
