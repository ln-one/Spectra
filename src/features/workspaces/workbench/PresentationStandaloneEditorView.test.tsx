import { fireEvent, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import type { PresentationDetail } from "@/features/artifacts/presentations/types";
import { renderWithIntl } from "../../../../tests/render";
import type { PresentationEditorFrame } from "./PresentationEditorFrame";
import { PresentationStandaloneEditorView } from "./PresentationStandaloneEditorView";

const testState = vi.hoisted(() => ({
  frameProps: null as ComponentProps<typeof PresentationEditorFrame> | null,
  prefetch: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: testState.prefetch, replace: testState.replace }),
}));

vi.mock("./PresentationEditorFrame", () => ({
  PresentationEditorFrame: (props: ComponentProps<typeof PresentationEditorFrame>) => {
    testState.frameProps = props;
    return (
      <button type="button" onClick={props.onClose}>
        Editor Back
      </button>
    );
  },
}));

const workspaceId = "00000000-0000-4000-8000-000000000001";
const artifactId = "00000000-0000-4000-8000-000000000002";
const revisionId = "00000000-0000-4000-8000-000000000003";
const conversationId = "00000000-0000-4000-8000-000000000004";
const timestamp = "2026-07-29T00:00:00.000Z";

const detail = {
  artifact: {
    createdAt: timestamp,
    currentRevision: {
      artifactId,
      content: {
        pageCount: 1,
        pageTitles: ["Cover"],
        schemaVersion: 1,
        summary: "Summary",
        title: "Standalone presentation",
      },
      contentSha256: "a".repeat(64),
      createdAt: timestamp,
      id: revisionId,
      parentRevisionId: null,
      revisionNumber: 1,
    },
    groundingSources: [],
    id: artifactId,
    title: "Standalone presentation",
    updatedAt: timestamp,
    workspaceId,
  },
  createdAt: timestamp,
  failureCode: null,
  generationAttemptId: null,
  generationDraft: null,
  generationSequence: 1,
  generationState: "ready",
  id: artifactId,
  kind: "presentation",
  title: "Standalone presentation",
  updatedAt: timestamp,
  workspaceId,
} satisfies PresentationDetail;

beforeEach(() => {
  testState.frameProps = null;
  testState.prefetch.mockReset();
  testState.replace.mockReset();
});

test("renders only the original editor surface and returns to its conversation", () => {
  renderWithIntl(
    <PresentationStandaloneEditorView
      conversationId={conversationId}
      detail={detail}
      readOnly={false}
      returnHref="/developer/course?conversation=conversation"
      workspaceId={workspaceId}
    />,
  );

  expect(screen.getByTestId("presentation-standalone-page")).toBeVisible();
  expect(testState.frameProps).toEqual(
    expect.objectContaining({
      artifactId,
      conversationId,
      readOnly: false,
      revisionId,
      workspaceId,
    }),
  );
  expect(testState.prefetch).toHaveBeenCalledWith("/developer/course?conversation=conversation");

  fireEvent.click(screen.getByRole("button", { name: "Editor Back" }));
  expect(testState.replace).toHaveBeenCalledWith("/developer/course?conversation=conversation", {
    scroll: false,
  });
});
