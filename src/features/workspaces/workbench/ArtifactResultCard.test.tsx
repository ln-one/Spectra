import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
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
