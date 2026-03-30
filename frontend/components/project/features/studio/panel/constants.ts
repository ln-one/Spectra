import type { GenerationToolType } from "@/lib/project-space/artifact-history";

export const STUDIO_CARD_BY_TOOL: Partial<Record<GenerationToolType, string>> =
  {
    ppt: "courseware_ppt",
    word: "word_document",
    mindmap: "knowledge_mindmap",
    outline: "interactive_games",
    quiz: "interactive_quick_quiz",
    summary: "speaker_notes",
    animation: "demonstration_animations",
    handout: "classroom_qa_simulator",
  };

export const DEFAULT_CAPABILITY_PENDING_REASON =
  "Backend capability is syncing. Real backend output will be shown once ready.";

export const STUDIO_RUNTIME_ARTIFACTS_STORAGE_PREFIX =
  "spectra:studio:runtime-artifacts";
