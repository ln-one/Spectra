import { screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { AnimationDetail } from "@/features/artifacts/animations/types";
import { renderWithIntl } from "../../../../tests/render";
import { AnimationWorkspaceView } from "./AnimationWorkspaceView";

vi.mock("@mux/mux-player-react", async () => {
  const React = await import("react");
  return {
    default: (props: Record<string, unknown>) => React.createElement("mux-player", props),
  };
});

const workspaceId = "00000000-0000-4000-8000-000000000001";
const artifactId = "00000000-0000-4000-8000-000000000002";
const revisionId = "00000000-0000-4000-8000-000000000003";
const attemptId = "00000000-0000-4000-8000-000000000004";
const conversationId = "00000000-0000-4000-8000-000000000005";
const timestamp = "2026-07-26T00:00:00.000Z";

const readyDetail: AnimationDetail = {
  artifact: {
    createdAt: timestamp,
    currentRevision: {
      artifactId,
      content: {
        compositionId: "Main",
        durationInFrames: 450,
        fps: 30,
        height: 1080,
        schemaVersion: 1,
        summary: "A durable knowledge animation.",
        title: "Gradient descent",
        width: 1920,
      },
      contentSha256: "a".repeat(64),
      createdAt: timestamp,
      id: revisionId,
      parentRevisionId: null,
      revisionNumber: 1,
    },
    groundingSources: [],
    id: artifactId,
    title: "Gradient descent",
    updatedAt: timestamp,
    workspaceId,
  },
  createdAt: timestamp,
  failureCode: null,
  generationAttemptId: attemptId,
  generationDraft: null,
  generationSequence: 7,
  generationState: "ready",
  id: artifactId,
  kind: "animation",
  title: "Gradient descent",
  updatedAt: timestamp,
  workspaceId,
};

function view(detail: AnimationDetail | null, phase: "idle" | "generating" | "ready") {
  return (
    <AnimationWorkspaceView
      conversationId={conversationId}
      detail={detail}
      onBack={vi.fn()}
      onDetailUpdated={vi.fn()}
      onSuggestion={vi.fn()}
      phase={phase}
      workspaceId={workspaceId}
    />
  );
}

test("requests Animation-specific suggestions before creation", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        status: "fresh",
        suggestions: [
          { prompt: "制作梯度下降动画", title: "梯度下降" },
          { prompt: "制作区块链动画", title: "区块链" },
          { prompt: "制作贝叶斯动画", title: "贝叶斯" },
          { prompt: "制作神经网络动画", title: "神经网络" },
        ],
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    ),
  );
  renderWithIntl(view(null, "idle"));
  expect(await screen.findByRole("button", { name: /梯度下降/ })).toBeEnabled();
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("target=animation"));
  fetchMock.mockRestore();
});

test("plays the authorized MP4 without exposing authoring or composition details", async () => {
  renderWithIntl(view(readyDetail, "ready"));
  expect(document.querySelector("mux-player")).toHaveAttribute("title", "Gradient descent");
  expect(document.querySelector("mux-player")).toHaveAttribute(
    "src",
    expect.stringContaining(`/api/artifacts/animation/${artifactId}/video.mp4?`),
  );
  expect(document.querySelector("mux-player")).toHaveAttribute("preload", "metadata");
  const download = screen.getByRole("link", { name: "下载 MP4" });
  expect(download).toHaveAttribute("href", expect.stringContaining(`revisionId=${revisionId}`));

  expect(screen.getByTestId("animation-player-stage")).toBeVisible();
  expect(screen.queryByText("A durable knowledge animation.")).not.toBeInTheDocument();
  expect(screen.queryByText(/Main · 1920×1080 · 30 fps/)).not.toBeInTheDocument();
});

test("shows the monotonic public stage while authoring runs", () => {
  renderWithIntl(
    view(
      {
        ...readyDetail,
        artifact: null,
        generationDraft: { phase: "rendering", schemaVersion: 1 },
        generationState: "generating",
      },
      "generating",
    ),
  );
  expect(screen.getAllByText("渲染视频")).toHaveLength(2);
  expect(screen.getByTestId("animation-generation-placeholder")).toBeVisible();
  expect(screen.getByTestId("animation-preview-placeholder")).toBeVisible();
  expect(screen.getByTestId("animation-timeline-placeholder")).toBeVisible();
  expect(
    screen.getByTestId("animation-live-scroll").querySelector(".overflow-hidden"),
  ).not.toBeNull();
});
