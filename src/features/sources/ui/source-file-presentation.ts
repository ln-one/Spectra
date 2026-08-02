import type { LucideIcon } from "lucide-react";
import {
  AudioLines,
  Braces,
  Captions,
  Clapperboard,
  File,
  FileCode2,
  FilePenLine,
  FileSpreadsheet,
  FileText,
  FileType2,
  Image,
  NotebookTabs,
  Presentation,
  Table2,
} from "lucide-react";
import { WorkspaceSourceIcon } from "@/components/icons/WorkspaceSourceIcon";
import type { ArtifactSourceKind } from "@/features/artifacts/types";
import {
  type ArtifactTone,
  artifactPresentation,
} from "@/features/artifacts/ui/artifact-presentation";
import {
  type SourcePresentationHint,
  type SourceVisualFamily,
  sourcePresentationHintForFilename,
  sourceVisualFamily,
} from "../presentation";

export type SourcePresentation =
  | {
      category: "artifact";
      Icon: LucideIcon;
      tone: ArtifactTone;
    }
  | {
      category: "file" | "workspace";
      Icon: LucideIcon;
      iconTone: SourceVisualFamily;
    };

type ArtifactSourcePresentation = Extract<SourcePresentation, { category: "artifact" }>;
type FileSourcePresentation = Extract<SourcePresentation, { category: "file" | "workspace" }>;

const sourceFileVisualFamilies = {
  pdf: { Icon: FileText, iconTone: "pdf" },
  document: { Icon: FilePenLine, iconTone: "document" },
  presentation: { Icon: Presentation, iconTone: "presentation" },
  spreadsheet: { Icon: FileSpreadsheet, iconTone: "spreadsheet" },
  text: { Icon: FileType2, iconTone: "text" },
  table: { Icon: Table2, iconTone: "table" },
  structured: { Icon: Braces, iconTone: "structured" },
  code: { Icon: FileCode2, iconTone: "code" },
  captions: { Icon: Captions, iconTone: "captions" },
  notebook: { Icon: NotebookTabs, iconTone: "notebook" },
  image: { Icon: Image, iconTone: "image" },
  audio: { Icon: AudioLines, iconTone: "audio" },
  video: { Icon: Clapperboard, iconTone: "video" },
  neutral: { Icon: File, iconTone: "neutral" },
  workspace: { Icon: WorkspaceSourceIcon, iconTone: "workspace" },
} as const satisfies Record<SourceVisualFamily, { Icon: LucideIcon; iconTone: SourceVisualFamily }>;

export function sourceFilePresentation(filename: string) {
  return sourceFileVisualFamilies[sourceVisualFamily(filename)];
}

export function sourcePresentationFromHint(
  hint: SourcePresentationHint | null | undefined,
  sourceName: string,
): SourcePresentation {
  const resolved = hint ?? sourcePresentationHintForFilename(sourceName);
  if (resolved.kind === "artifact") {
    return {
      category: "artifact" as const,
      ...artifactPresentation(resolved.artifactKind),
    };
  }
  return {
    category: "file" as const,
    ...sourceFileVisualFamilies[resolved.family],
  };
}

export function artifactSourcePresentation(kind: ArtifactSourceKind): ArtifactSourcePresentation {
  return {
    category: "artifact" as const,
    ...artifactPresentation(kind),
  };
}

export function workspaceSourcePresentation(unavailable = false): FileSourcePresentation {
  return {
    category: "workspace" as const,
    Icon: WorkspaceSourceIcon,
    iconTone: unavailable ? "neutral" : "workspace",
  };
}
