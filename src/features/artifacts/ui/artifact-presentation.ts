import {
  Clapperboard,
  ClipboardCheck,
  FileText,
  Gamepad2,
  type LucideIcon,
  MonitorPlay,
  Network,
} from "lucide-react";
import type { ArtifactKind } from "../types";

export type ArtifactTone = "orange" | "blue" | "teal" | "rose" | "violet" | "green";

export type ArtifactPresentation = {
  Icon: LucideIcon;
  tone: ArtifactTone;
};

export const ARTIFACT_PRESENTATIONS = {
  teaching_document: { Icon: FileText, tone: "blue" },
  mind_map: { Icon: Network, tone: "teal" },
  quiz: { Icon: ClipboardCheck, tone: "violet" },
  game: { Icon: Gamepad2, tone: "rose" },
  presentation: { Icon: MonitorPlay, tone: "orange" },
  animation: { Icon: Clapperboard, tone: "green" },
} satisfies Record<ArtifactKind, ArtifactPresentation>;

export function artifactPresentation(kind: ArtifactKind): ArtifactPresentation {
  return ARTIFACT_PRESENTATIONS[kind];
}
