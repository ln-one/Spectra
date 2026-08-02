import { fireEvent, render, screen } from "@testing-library/react";
import { Sparkles } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { expect, test, vi } from "vitest";
import {
  ArtifactGenerationView,
  ArtifactStartView,
  ArtifactWorkspaceShell,
} from "./ArtifactWorkspacePrimitives";

const suggestions = [1, 2, 3, 4].map((index) => ({
  prompt: `Prompt ${index}`,
  title: `Suggestion ${index}`,
}));

test("renders exactly four equal-height suggestions for a test-only Artifact", () => {
  const onSuggestion = vi.fn();
  render(
    <ArtifactStartView
      description="Description"
      error={false}
      errorLabel="Suggestions unavailable"
      Icon={Sparkles}
      loading={false}
      loadingLabel="Loading"
      onRefresh={vi.fn()}
      onRetry={vi.fn()}
      onSuggestion={onSuggestion}
      refreshing={false}
      refreshLabel="Refresh"
      suggestions={suggestions}
      title="Test Artifact"
    />,
  );
  const cards = suggestions.map((suggestion) =>
    screen.getByText(suggestion.title).closest("button"),
  );
  expect(cards).toHaveLength(4);
  for (const card of cards) expect(card).toHaveClass("h-[172px]");
  fireEvent.click(screen.getByText("Suggestion 1"));
  expect(onSuggestion).toHaveBeenCalledWith("Prompt 1");
});

test("keeps suggestion cards visible but inactive while refreshing", () => {
  const onSuggestion = vi.fn();
  render(
    <ArtifactStartView
      description="Description"
      error={false}
      errorLabel="Suggestions unavailable"
      Icon={Sparkles}
      loading={false}
      loadingLabel="Preparing suggestions"
      onRefresh={vi.fn()}
      onRetry={vi.fn()}
      onSuggestion={onSuggestion}
      refreshing
      refreshLabel="Refresh"
      suggestions={suggestions}
      title="Test Artifact"
    />,
  );

  expect(screen.getByRole("button", { name: "Preparing suggestions" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Preparing suggestions");
  const cards = suggestions.map((suggestion) =>
    screen.getByText(suggestion.title).closest("button"),
  );
  for (const card of cards) expect(card).toBeDisabled();
  for (const content of screen.getAllByTestId("suggestion-card-content")) {
    expect(content).toHaveClass("workspace-suggestion-content-refreshing");
  }
  fireEvent.click(screen.getByText("Suggestion 1"));
  expect(onSuggestion).not.toHaveBeenCalled();
});

test("shows a breathing generation state without content skeleton lines", () => {
  render(
    <ArtifactGenerationView
      failedMessage="Failed"
      hasRenderableContent={false}
      phase="generating"
      status="Generating"
      testId="test-generation-placeholder"
    >
      Content
    </ArtifactGenerationView>,
  );
  const placeholder = screen.getByTestId("test-generation-placeholder");
  expect(placeholder).toHaveTextContent("Generating");
  expect(placeholder.querySelectorAll(".h-3")).toHaveLength(0);
  expect(placeholder.querySelector(".animate-pulse")).not.toBeNull();
});

test("shows a busy, disabled exit control while an Artifact is saving", () => {
  const onBack = vi.fn();
  render(
    <NextIntlClientProvider locale="zh-CN" messages={{ Workbench: {} }}>
      <ArtifactWorkspaceShell
        backBusy
        backLabel="退出成果"
        liveScrollTestId="artifact-scroll"
        onBack={onBack}
        phase="ready"
        subtitle="副标题"
        testId="artifact-shell"
        title="随堂小测"
      >
        内容
      </ArtifactWorkspaceShell>
    </NextIntlClientProvider>,
  );

  const back = screen.getByRole("button", { name: "退出成果" });
  expect(back).toBeDisabled();
  expect(back).toHaveAttribute("aria-busy", "true");
  expect(back.querySelector(".animate-spin")).not.toBeNull();
  fireEvent.click(back);
  expect(onBack).not.toHaveBeenCalled();
});

test("shows the unique Artifact source receipt and opens its source list", () => {
  render(
    <NextIntlClientProvider
      locale="zh-CN"
      messages={{
        Workbench: {
          artifactSourcesClose: "关闭参考资料",
          artifactSourcesDescription: "生成时提供的资料。",
          artifactSourcesOpen: "查看该成果参考的 2 份资料",
          artifactSourcesTitle: "生成时提供的资料",
          artifactSourcesTrigger: "参考资料 2",
        },
      }}
    >
      <ArtifactWorkspaceShell
        backLabel="返回"
        groundingSources={[
          {
            sourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            sourceName: "课程讲义.pdf",
          },
          {
            sourceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            sourceName: "课堂笔记.docx",
          },
        ]}
        liveScrollTestId="artifact-scroll"
        onBack={vi.fn()}
        phase="ready"
        subtitle="副标题"
        testId="artifact-shell"
        title="教学文档"
      >
        内容
      </ArtifactWorkspaceShell>
    </NextIntlClientProvider>,
  );

  const trigger = screen.getByRole("button", { name: "查看该成果参考的 2 份资料" });
  expect(trigger.querySelector(".workspace-source-file-icon")).toBeNull();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "生成时提供的资料" });
  expect(dialog).toHaveTextContent("课程讲义.pdf");
  expect(dialog).toHaveTextContent("课堂笔记.docx");
  const sourceIcons = dialog.querySelectorAll(".workspace-source-file-icon");
  expect(sourceIcons[0]).toHaveStyle("--source-icon-foreground-light: #be123c");
  expect(sourceIcons[1]).toHaveStyle("--source-icon-foreground-light: #1d4ed8");
});

test("uses a single source type for the receipt trigger", () => {
  render(
    <NextIntlClientProvider
      locale="zh-CN"
      messages={{
        Workbench: {
          artifactSourcesClose: "关闭参考资料",
          artifactSourcesDescription: "生成时提供的资料。",
          artifactSourcesOpen: "查看该成果参考的 1 份资料",
          artifactSourcesTitle: "生成时提供的资料",
          artifactSourcesTrigger: "参考资料 1",
        },
      }}
    >
      <ArtifactWorkspaceShell
        backLabel="返回"
        groundingSources={[
          {
            sourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            sourceName: "随堂小测",
            sourcePresentation: { artifactKind: "quiz", kind: "artifact" },
          },
        ]}
        liveScrollTestId="artifact-scroll"
        onBack={vi.fn()}
        phase="ready"
        subtitle="副标题"
        testId="artifact-shell"
        title="教学文档"
      >
        内容
      </ArtifactWorkspaceShell>
    </NextIntlClientProvider>,
  );

  expect(
    screen
      .getByRole("button", { name: "查看该成果参考的 1 份资料" })
      .querySelector(".workspace-artifact-source-icon"),
  ).toHaveAttribute("data-studio-tone", "violet");
});
