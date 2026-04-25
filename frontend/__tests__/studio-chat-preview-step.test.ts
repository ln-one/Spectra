import { shouldForcePreviewChatStep } from "@/components/project/features/studio/panel/chat-preview-step";

describe("studio chat preview step forcing", () => {
  it("forces word chat context into preview as soon as a draft artifact is available", () => {
    expect(
      shouldForcePreviewChatStep({
        toolType: "word",
        isWordHistoryMode: false,
        isManagedHistoryMode: false,
        expandedTool: "word",
        resolvedArtifactId: "word-artifact-1",
        managedTargetArtifactId: "word-artifact-1",
        managedTargetStatus: "previewing",
      })
    ).toBe(true);
  });

  it("keeps word chat context in config/generate when no draft result exists yet", () => {
    expect(
      shouldForcePreviewChatStep({
        toolType: "word",
        isWordHistoryMode: false,
        isManagedHistoryMode: false,
        expandedTool: "word",
        resolvedArtifactId: null,
        managedTargetArtifactId: null,
        managedTargetStatus: "draft",
      })
    ).toBe(false);
  });

  it("preserves the existing mindmap preview forcing behavior", () => {
    expect(
      shouldForcePreviewChatStep({
        toolType: "mindmap",
        isWordHistoryMode: false,
        isManagedHistoryMode: false,
        expandedTool: "mindmap",
        resolvedArtifactId: null,
        managedTargetArtifactId: "mindmap-artifact-1",
        managedTargetStatus: "previewing",
      })
    ).toBe(true);
  });

  it("forces quiz chat context into preview once a quiz artifact is available", () => {
    expect(
      shouldForcePreviewChatStep({
        toolType: "quiz",
        isWordHistoryMode: false,
        isManagedHistoryMode: false,
        expandedTool: "quiz",
        resolvedArtifactId: "quiz-artifact-1",
        managedTargetArtifactId: "quiz-artifact-1",
        managedTargetStatus: "completed",
      })
    ).toBe(true);
  });
});
