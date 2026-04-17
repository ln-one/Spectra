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
  "后端能力正在同步中，真实结果就绪后会在这里直接显示。";

export const STUDIO_RUNTIME_ARTIFACTS_STORAGE_PREFIX =
  "spectra:studio:runtime-artifacts";
