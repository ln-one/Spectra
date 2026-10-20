"use client";

import { useTranslations } from "next-intl";
import type { ArtifactKind } from "@/features/artifacts/types";
import { studioToolForArtifactKind } from "./artifactWorkbench";
import { STUDIO_TOOL_PRESENTATIONS } from "./studioTools";

export function CreationToolMessageBadge({ kind }: { kind: ArtifactKind }) {
  const t = useTranslations("Workbench");
  const toolId = studioToolForArtifactKind(kind);
  if (!toolId) return null;
  const { Icon, labelKey, tone } = STUDIO_TOOL_PRESENTATIONS[toolId];

  return (
    <span
      data-studio-tone={tone}
      className="mb-2 flex w-fit max-w-full items-center gap-1.5 rounded-full border border-[var(--studio-icon-border)] bg-[var(--studio-icon-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--studio-accent-text)]"
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{t(labelKey)}</span>
    </span>
  );
}
