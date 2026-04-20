import { act, fireEvent, render, screen } from "@testing-library/react";
import { useStudioWorkflowHistory } from "@/components/project/features/studio/history/useStudioWorkflowHistory";
import type { ArtifactHistoryByTool } from "@/lib/project-space/artifact-history";

const buildEmptyHistory = (): ArtifactHistoryByTool => ({
  ppt: [],
  word: [],
  mindmap: [],
  outline: [],
  quiz: [],
  summary: [],
  animation: [],
  handout: [],
});

function WorkflowHistoryProbe() {
  const { groupedHistory, recordWorkflowEntry } = useStudioWorkflowHistory(
    buildEmptyHistory(),
    "sess-1",
    "proj-1"
  );
  const wordItems = groupedHistory.find(([toolType]) => toolType === "word")?.[1] ?? [];

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          recordWorkflowEntry({
            toolType: "word",
            title: "教学文档 - Draft",
            status: "draft",
            step: "generate",
            sessionId: "sess-1",
            titleSource: JSON.stringify({
              kind: "teaching_document",
              topic: "计算机网络：物理层",
              output_requirements: "突出重难点突破",
            }),
            toolLabel: "教学文档",
          })
        }
      >
        record-draft
      </button>
      <button
        type="button"
        onClick={() =>
          recordWorkflowEntry({
            toolType: "word",
            title: "教学文档 - Generating",
            status: "processing",
            step: "preview",
            sessionId: "sess-1",
            titleSource: JSON.stringify({
              kind: "teaching_document",
              topic: "计算机网络：物理层",
              output_requirements: "突出重难点突破",
            }),
            toolLabel: "教学文档",
          })
        }
      >
        record-processing
      </button>
      <div data-testid="word-count">{String(wordItems.length)}</div>
      <div data-testid="word-title">{wordItems[0]?.title ?? ""}</div>
      <div data-testid="word-status">{wordItems[0]?.status ?? ""}</div>
    </div>
  );
}

function WorkflowHistoryRunAwareProbe() {
  const { groupedHistory, recordWorkflowEntry } = useStudioWorkflowHistory(
    buildEmptyHistory(),
    "sess-1",
    "proj-1"
  );
  const wordItems = groupedHistory.find(([toolType]) => toolType === "word")?.[1] ?? [];

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          recordWorkflowEntry({
            toolType: "word",
            title: "教学文档 - Draft",
            status: "draft",
            step: "generate",
            sessionId: "sess-1",
            runId: "run-1",
            titleSource: JSON.stringify({
              kind: "teaching_document",
              topic: "计算机网络：物理层",
            }),
            toolLabel: "教学文档",
          })
        }
      >
        record-draft-with-run
      </button>
      <button
        type="button"
        onClick={() =>
          recordWorkflowEntry({
            toolType: "word",
            title: "教学文档 - Generating",
            status: "processing",
            step: "preview",
            sessionId: "sess-1",
            titleSource: JSON.stringify({
              kind: "teaching_document",
              topic: "计算机网络：物理层",
            }),
            toolLabel: "教学文档",
          })
        }
      >
        record-processing-without-run
      </button>
      <div data-testid="word-run-aware-count">{String(wordItems.length)}</div>
      <div data-testid="word-run-aware-status">{wordItems[0]?.status ?? ""}</div>
      <div data-testid="word-run-aware-run-id">{wordItems[0]?.runId ?? ""}</div>
    </div>
  );
}

function WorkflowHistoryWithArtifactProbe() {
  const artifactHistory = buildEmptyHistory();
  artifactHistory.word = [
    {
      artifactId: "word-artifact-1",
      sessionId: "sess-1",
      toolType: "word",
      artifactType: "docx",
      title: "计算机网络：物理层教案",
      metadataTitle: "计算机网络：物理层教案",
      status: "completed",
      createdAt: "2026-04-19T15:45:00.000Z",
      basedOnVersionId: null,
      runId: null,
      runNo: null,
    },
  ];
  const { groupedHistory, recordWorkflowEntry } = useStudioWorkflowHistory(
    artifactHistory,
    "sess-1",
    "proj-1"
  );
  const wordItems = groupedHistory.find(([toolType]) => toolType === "word")?.[1] ?? [];

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          recordWorkflowEntry({
            toolType: "word",
            title: "教学文档 - Preview",
            status: "previewing",
            step: "preview",
            sessionId: "sess-1",
            titleSource: JSON.stringify({
              topic: "计算机网络：物理层",
            }),
            toolLabel: "教学文档",
          })
        }
      >
        record-preview
      </button>
      <div data-testid="word-item-count">{String(wordItems.length)}</div>
      <div data-testid="word-item-title">{wordItems[0]?.title ?? ""}</div>
    </div>
  );
}

function WorkflowHistoryDraftAndArtifactProbe() {
  const artifactHistory = buildEmptyHistory();
  artifactHistory.word = [
    {
      artifactId: "word-artifact-1",
      sessionId: "sess-1",
      toolType: "word",
      artifactType: "docx",
      title: "计算机网络：物理层教案",
      metadataTitle: "计算机网络：物理层教案",
      status: "completed",
      createdAt: "2026-04-19T15:45:00.000Z",
      basedOnVersionId: null,
      runId: "run-1",
      runNo: 1,
    },
  ];
  const { groupedHistory, recordWorkflowEntry } = useStudioWorkflowHistory(
    artifactHistory,
    "sess-1",
    "proj-1"
  );
  const wordItems = groupedHistory.find(([toolType]) => toolType === "word")?.[1] ?? [];

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          recordWorkflowEntry({
            toolType: "word",
            title: "教学文档 - Draft",
            status: "draft",
            step: "generate",
            sessionId: "sess-1",
            runId: "run-1",
            createdAt: "2026-04-19T15:40:00.000Z",
            titleSource: JSON.stringify({
              topic: "计算机网络：物理层",
            }),
            toolLabel: "教学文档",
          })
        }
      >
        record-old-draft
      </button>
      <div data-testid="word-draft-item-count">{String(wordItems.length)}</div>
      <div data-testid="word-draft-item-title">{wordItems[0]?.title ?? ""}</div>
    </div>
  );
}

function WorkflowHistoryWordReplacementProbe() {
  const artifactHistory = buildEmptyHistory();
  artifactHistory.word = [
    {
      artifactId: "word-artifact-1",
      sessionId: "sess-1",
      toolType: "word",
      artifactType: "docx",
      title: "教案 v1",
      metadataTitle: "教案 v1",
      status: "completed",
      createdAt: "2026-04-19T15:45:00.000Z",
      basedOnVersionId: null,
      runId: null,
      runNo: null,
    },
    {
      artifactId: "word-artifact-2",
      sessionId: "sess-1",
      toolType: "word",
      artifactType: "docx",
      title: "教案 v2",
      metadataTitle: "教案 v2",
      status: "completed",
      createdAt: "2026-04-19T15:50:00.000Z",
      basedOnVersionId: null,
      runId: null,
      runNo: null,
    },
  ];
  const { groupedHistory } = useStudioWorkflowHistory(
    artifactHistory,
    "sess-1",
    "proj-1"
  );
  const wordItems = groupedHistory.find(([toolType]) => toolType === "word")?.[1] ?? [];

  return (
    <div>
      <div data-testid="word-replacement-count">{String(wordItems.length)}</div>
      <div data-testid="word-replacement-title">{wordItems[0]?.title ?? ""}</div>
    </div>
  );
}

function WorkflowHistoryMindmapReplacementProbe() {
  const artifactHistory = buildEmptyHistory();
  artifactHistory.mindmap = [
    {
      artifactId: "mindmap-artifact-1",
      sessionId: "sess-1",
      toolType: "mindmap",
      artifactType: "mindmap",
      title: "导图 v1",
      metadataTitle: "导图 v1",
      status: "completed",
      createdAt: "2026-04-19T15:45:00.000Z",
      basedOnVersionId: null,
      runId: null,
      runNo: null,
      supersededByArtifactId: "mindmap-artifact-2",
      isCurrent: false,
    },
    {
      artifactId: "mindmap-artifact-2",
      sessionId: "sess-1",
      toolType: "mindmap",
      artifactType: "mindmap",
      title: "导图 v2",
      metadataTitle: "导图 v2",
      status: "completed",
      createdAt: "2026-04-19T15:50:00.000Z",
      basedOnVersionId: null,
      runId: null,
      runNo: null,
      replacesArtifactId: "mindmap-artifact-1",
      isCurrent: true,
    },
  ];
  const { groupedHistory } = useStudioWorkflowHistory(
    artifactHistory,
    "sess-1",
    "proj-1"
  );
  const mindmapItems =
    groupedHistory.find(([toolType]) => toolType === "mindmap")?.[1] ?? [];

  return (
    <div>
      <div data-testid="mindmap-replacement-count">
        {String(mindmapItems.length)}
      </div>
      <div data-testid="mindmap-replacement-title">
        {mindmapItems[0]?.title ?? ""}
      </div>
    </div>
  );
}

describe("useStudioWorkflowHistory", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reuses the same transient word workflow entry across draft and processing", () => {
    render(<WorkflowHistoryProbe />);

    act(() => {
      fireEvent.click(screen.getByText("record-draft"));
      fireEvent.click(screen.getByText("record-processing"));
    });

    expect(screen.getByTestId("word-count").textContent).toBe("1");
    expect(screen.getByTestId("word-status").textContent).toBe("processing");
  });

  it("promotes a draft row to processing even when the follow-up update is missing runId", () => {
    render(<WorkflowHistoryRunAwareProbe />);

    act(() => {
      fireEvent.click(screen.getByText("record-draft-with-run"));
      fireEvent.click(screen.getByText("record-processing-without-run"));
    });

    expect(screen.getByTestId("word-run-aware-count").textContent).toBe("1");
    expect(screen.getByTestId("word-run-aware-status").textContent).toBe("processing");
    expect(screen.getByTestId("word-run-aware-run-id").textContent).toBe("run-1");
  });

  it("builds the workflow title from lesson-plan fields instead of raw JSON keys", () => {
    render(<WorkflowHistoryProbe />);

    act(() => {
      fireEvent.click(screen.getByText("record-draft"));
    });

    expect(screen.getByTestId("word-title").textContent).toContain(
      "计算机网络：物理层"
    );
    expect(screen.getByTestId("word-title").textContent).not.toContain("kind");
  });

  it("drops preview workflow rows once a real word artifact exists", () => {
    render(<WorkflowHistoryWithArtifactProbe />);

    act(() => {
      fireEvent.click(screen.getByText("record-preview"));
    });

    expect(screen.getByTestId("word-item-count").textContent).toBe("1");
    expect(screen.getByTestId("word-item-title").textContent).toBe(
      "计算机网络：物理层教案"
    );
  });

  it("drops stale draft workflow rows once the completed word artifact lands", () => {
    render(<WorkflowHistoryDraftAndArtifactProbe />);

    act(() => {
      fireEvent.click(screen.getByText("record-old-draft"));
    });

    expect(screen.getByTestId("word-draft-item-count").textContent).toBe("1");
    expect(screen.getByTestId("word-draft-item-title").textContent).toBe(
      "计算机网络：物理层教案"
    );
  });

  it("keeps multiple word records when replacement versions accumulate", () => {
    render(<WorkflowHistoryWordReplacementProbe />);

    expect(screen.getByTestId("word-replacement-count").textContent).toBe("2");
    expect(screen.getByTestId("word-replacement-title").textContent).toBe("教案 v2");
  });

  it("keeps only the current mindmap replacement head in history", () => {
    render(<WorkflowHistoryMindmapReplacementProbe />);

    expect(screen.getByTestId("mindmap-replacement-count").textContent).toBe("1");
    expect(screen.getByTestId("mindmap-replacement-title").textContent).toBe(
      "导图 v2"
    );
  });
});
