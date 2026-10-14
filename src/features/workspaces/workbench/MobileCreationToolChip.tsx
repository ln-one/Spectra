"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { STUDIO_TOOL_PRESENTATIONS, type StudioToolId } from "./studioTools";

export function MobileCreationToolChip({
  onClear,
  toolId,
}: {
  onClear: () => void;
  toolId: StudioToolId;
}) {
  const t = useTranslations("Workbench");
  const { Icon, labelKey, tone } = STUDIO_TOOL_PRESENTATIONS[toolId];
  const name = t(labelKey);

  return (
    <div className="px-2.5 pt-1.5 pb-0.5 lg:hidden">
      <div
        data-studio-tone={tone}
        data-testid="selected-creation-tool"
        className="inline-flex max-w-full items-center gap-2 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] py-0.5 pl-2.5 pr-0.5 text-sm font-medium text-[var(--studio-accent-text)]"
      >
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="truncate">{name}</span>
        <button
          type="button"
          aria-label={t("removeCreationTool", { name })}
          onClick={onClear}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg outline-none hover:bg-[var(--studio-surface)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
