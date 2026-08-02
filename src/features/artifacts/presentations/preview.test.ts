import { describe, expect, test } from "vitest";
import { presentationPreviewPhase } from "./preview";
import { type PresentationDetail, presentationDetailSchema } from "./types";

const timestamp = "2026-07-29T00:00:00.000Z";
const manifest = `
version: 1
title: Stream
size: [1280, 720]
theme:
  colors: {}
  textStyles: {}
pages:
  - pages/1.page
  - pages/2.page
`;

function detail(
  state: "failed" | "generating" | "finalizing",
  pageMap?: Record<string, string>,
): PresentationDetail {
  return presentationDetailSchema.parse({
    artifact: null,
    createdAt: timestamp,
    failureCode: state === "failed" ? "generation_failed" : null,
    generationAttemptId: "00000000-0000-4000-8000-000000000001",
    generationDraft: pageMap
      ? {
          phase: state === "finalizing" ? "publishing" : "authoring",
          preview: { pageMap, pptdContent: manifest, totalPages: 2 },
          schemaVersion: 1,
        }
      : null,
    generationSequence: 1,
    generationState: state,
    id: "00000000-0000-4000-8000-000000000002",
    kind: "presentation",
    title: "Stream",
    updatedAt: timestamp,
    workspaceId: "00000000-0000-4000-8000-000000000003",
  });
}

describe("presentationPreviewPhase", () => {
  test("waits until a trustworthy manifest and first page exist", () => {
    expect(presentationPreviewPhase(null)).toBe("waiting");
    expect(presentationPreviewPhase(detail("generating"))).toBe("waiting");
  });

  test("uses manifest paths rather than page object count", () => {
    expect(presentationPreviewPhase(detail("generating", { "pages/1.page": "page" }))).toBe(
      "generating",
    );
    expect(
      presentationPreviewPhase(
        detail("generating", {
          "pages/1.page": "page",
          "unrelated.page": "page",
        }),
      ),
    ).toBe("generating");
  });

  test("checks after every manifest page arrives or finalizing begins", () => {
    expect(
      presentationPreviewPhase(
        detail("generating", {
          "pages/2.page": "page",
          "pages/1.page": "page",
        }),
      ),
    ).toBe("checking");
    expect(presentationPreviewPhase(detail("finalizing", { "pages/1.page": "page" }))).toBe(
      "checking",
    );
  });

  test("keeps failure terminal even when preview pages remain available", () => {
    expect(presentationPreviewPhase(detail("failed", { "pages/1.page": "page" }))).toBe("failed");
  });
});
