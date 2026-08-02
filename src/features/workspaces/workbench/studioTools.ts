import type { LucideIcon } from "lucide-react";
import { ARTIFACT_PRESENTATIONS } from "@/features/artifacts/ui/artifact-presentation";

export const STUDIO_TOOL_IDS = [
  "smart-slides",
  "teaching-document",
  "mind-map",
  "interactive-game",
  "quiz",
  "animation",
] as const;

export type StudioToolId = (typeof STUDIO_TOOL_IDS)[number];

export type StudioTone =
  | "neutral"
  | "orange"
  | "blue"
  | "teal"
  | "rose"
  | "violet"
  | "sky"
  | "green"
  | "amber";

type StudioToolPresentation = {
  Icon: LucideIcon;
  labelKey:
    | "tools.smartSlides"
    | "tools.teachingDocument"
    | "tools.mindMap"
    | "tools.interactiveGame"
    | "tools.quiz"
    | "tools.animation";
  tone: Exclude<StudioTone, "neutral">;
};

export const STUDIO_TOOL_PRESENTATIONS = {
  "smart-slides": {
    ...ARTIFACT_PRESENTATIONS.presentation,
    labelKey: "tools.smartSlides",
  },
  "teaching-document": {
    ...ARTIFACT_PRESENTATIONS.teaching_document,
    labelKey: "tools.teachingDocument",
  },
  "mind-map": {
    ...ARTIFACT_PRESENTATIONS.mind_map,
    labelKey: "tools.mindMap",
  },
  "interactive-game": {
    ...ARTIFACT_PRESENTATIONS.game,
    labelKey: "tools.interactiveGame",
  },
  quiz: {
    ...ARTIFACT_PRESENTATIONS.quiz,
    labelKey: "tools.quiz",
  },
  animation: {
    ...ARTIFACT_PRESENTATIONS.animation,
    labelKey: "tools.animation",
  },
} satisfies Record<StudioToolId, StudioToolPresentation>;

export function studioToolTone(toolId: StudioToolId): Exclude<StudioTone, "neutral"> {
  return STUDIO_TOOL_PRESENTATIONS[toolId].tone;
}
