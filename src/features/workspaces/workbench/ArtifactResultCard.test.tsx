import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { renderWithIntl } from "../../../../tests/render";
import { ArtifactResultCard } from "./ArtifactResultCard";

test("labels ready Artifact cards by their actual kind", () => {
  const common = {
    artifactId: "00000000-0000-4000-8000-000000000099",
    conversationId: "00000000-0000-4000-8000-000000000008",
    fallbackState: "ready" as const,
    fallbackTitle: "成果",
  };
  const { rerender } = renderWithIntl(<ArtifactResultCard {...common} fallbackKind="mind_map" />);
  expect(screen.getByText("思维导图已生成")).toBeInTheDocument();

  rerender(<ArtifactResultCard {...common} fallbackKind="teaching_document" />);
  expect(screen.getByText("教学文档已生成")).toBeInTheDocument();

  rerender(<ArtifactResultCard {...common} fallbackKind="quiz" />);
  expect(screen.getByText("随堂小测已生成")).toBeInTheDocument();
});

test("shows a type placeholder only for phase three previewable Artifact kinds", () => {
  const common = {
    artifactId: "00000000-0000-4000-8000-000000000099",
    conversationId: "00000000-0000-4000-8000-000000000008",
    fallbackState: "ready" as const,
    fallbackTitle: "成果",
  };
  const { rerender } = renderWithIntl(
    <ArtifactResultCard {...common} fallbackKind="presentation" />,
  );
  expect(screen.getByTestId("artifact-preview-placeholder")).toHaveTextContent("课件");

  rerender(<ArtifactResultCard {...common} fallbackKind="teaching_document" />);
  expect(screen.getByTestId("artifact-preview-placeholder")).toHaveTextContent("文档");

  rerender(<ArtifactResultCard {...common} fallbackKind="animation" />);
  expect(screen.getByTestId("artifact-preview-placeholder")).toHaveTextContent("动画");

  rerender(<ArtifactResultCard {...common} fallbackKind="mind_map" />);
  expect(screen.getByTestId("artifact-preview-placeholder")).toHaveTextContent("导图");

  rerender(<ArtifactResultCard {...common} fallbackKind="quiz" />);
  expect(screen.queryByTestId("artifact-preview-placeholder")).not.toBeInTheDocument();
});

test("uses each Artifact kind icon while it is generating", () => {
  const common = {
    artifactId: "00000000-0000-4000-8000-000000000099",
    conversationId: "00000000-0000-4000-8000-000000000008",
    fallbackState: "generating" as const,
    fallbackTitle: "成果",
  };
  const { container, rerender } = renderWithIntl(
    <ArtifactResultCard {...common} fallbackKind="mind_map" />,
  );
  expect(container.querySelector(".lucide-network")).toHaveClass("animate-pulse");
  expect(container.querySelector(".lucide-file-text")).not.toBeInTheDocument();

  rerender(<ArtifactResultCard {...common} fallbackKind="quiz" />);
  expect(container.querySelector(".lucide-clipboard-check")).toHaveClass("animate-pulse");

  rerender(<ArtifactResultCard {...common} fallbackKind="teaching_document" />);
  expect(container.querySelector(".lucide-file-text")).toHaveClass("animate-pulse");
});

test("treats a persisted revision as ready even when cached state is queued", () => {
  const artifactId = "00000000-0000-4000-8000-000000000099";
  renderWithIntl(
    <ArtifactResultCard
      artifactHistory={[
        {
          createdAt: "2026-07-19T10:00:00.000Z",
          currentRevisionId: "00000000-0000-4000-8000-000000000100",
          generationState: "queued",
          id: artifactId,
          kind: "teaching_document",
          title: "已完成文档",
          updatedAt: "2026-07-19T10:01:00.000Z",
        },
      ]}
      artifactId={artifactId}
      conversationId="00000000-0000-4000-8000-000000000008"
      fallbackKind="teaching_document"
      fallbackState="queued"
      fallbackTitle="旧标题"
    />,
  );

  expect(screen.getByText("教学文档已生成")).toBeInTheDocument();
  expect(screen.queryByText("等待处理")).not.toBeInTheDocument();
});

test("offers one retry for a failed generation when the server marks it retryable", async () => {
  const artifactId = "00000000-0000-4000-8000-000000000099";
  const retry = vi.fn().mockResolvedValue(undefined);
  renderWithIntl(
    <ArtifactResultCard
      artifactHistory={[
        {
          canRetryGeneration: true,
          createdAt: "2026-10-18T08:00:00.000Z",
          currentRevisionId: null,
          failureCode: "presentation_agent_stalled",
          generationState: "failed",
          id: artifactId,
          kind: "presentation",
          sourceUserMessageId: "user-generation-task",
          title: "分布式系统课件",
          updatedAt: "2026-10-18T08:03:00.000Z",
        },
      ]}
      artifactId={artifactId}
      conversationId="00000000-0000-4000-8000-000000000008"
      fallbackKind="presentation"
      fallbackState="queued"
      fallbackTitle="旧标题"
      onRetryArtifact={retry}
    />,
  );

  expect(screen.getByText("生成等待时间过长，任务已停止。")).toBeInTheDocument();
  const button = screen.getByRole("button", { name: "重试生成“分布式系统课件”" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
});

test("does not offer retry when the server does not support it", () => {
  const artifactId = "00000000-0000-4000-8000-000000000099";
  renderWithIntl(
    <ArtifactResultCard
      artifactHistory={[
        {
          canRetryGeneration: false,
          createdAt: "2026-10-18T08:00:00.000Z",
          currentRevisionId: null,
          failureCode: "mind_map_provider_failed",
          generationState: "failed",
          id: artifactId,
          kind: "mind_map",
          sourceUserMessageId: "user-generation-task",
          title: "知识图谱",
          updatedAt: "2026-10-18T08:03:00.000Z",
        },
      ]}
      artifactId={artifactId}
      conversationId="00000000-0000-4000-8000-000000000008"
      fallbackKind="mind_map"
      fallbackState="queued"
      fallbackTitle="旧标题"
      onRetryArtifact={vi.fn()}
    />,
  );

  expect(screen.queryByRole("button", { name: /重试生成/ })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "打开“知识图谱”" })).toBeInTheDocument();
});
