"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { isArtifactCreationToolAvailable } from "./artifactWorkbench";
import { STUDIO_TOOL_IDS, STUDIO_TOOL_PRESENTATIONS, type StudioToolId } from "./studioTools";

const TOOL_DESCRIPTION_KEYS = {
  "smart-slides": "toolDescriptions.smartSlides",
  "teaching-document": "toolDescriptions.teachingDocument",
  "mind-map": "toolDescriptions.mindMap",
  "interactive-game": "toolDescriptions.interactiveGame",
  quiz: "toolDescriptions.quiz",
  animation: "toolDescriptions.animation",
} as const satisfies Record<StudioToolId, string>;

export function MobileCreationToolsPage({
  onSelectTool,
  runtimeUnavailableTools = [],
}: {
  onSelectTool: (toolId: StudioToolId) => void;
  runtimeUnavailableTools?: readonly StudioToolId[] | undefined;
}) {
  const t = useTranslations("Workbench");

  return (
    <section
      aria-labelledby="mobile-creation-tools-title"
      className="h-full overflow-y-auto overscroll-contain px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-5 lg:hidden"
    >
      <div className="mx-auto w-full max-w-xl">
        <div className="px-1 pb-5">
          <h1
            id="mobile-creation-tools-title"
            className="text-2xl font-bold tracking-tight text-[var(--workspace-text-primary)]"
          >
            {t("creationToolsPageTitle")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--workspace-text-muted)]">
            {t("creationToolsPageDescription")}
          </p>
        </div>

        <div className="space-y-3">
          {STUDIO_TOOL_IDS.map((toolId) => {
            const { Icon, labelKey, tone } = STUDIO_TOOL_PRESENTATIONS[toolId];
            const unavailable = !isArtifactCreationToolAvailable(toolId);
            const runtimeUnavailable = runtimeUnavailableTools.includes(toolId);
            const label = t(labelKey);

            return (
              <button
                key={toolId}
                type="button"
                data-studio-tone={tone}
                disabled={unavailable}
                title={
                  unavailable || runtimeUnavailable ? t("toolUnavailable", { name: label }) : label
                }
                onClick={() => onSelectTool(toolId)}
                className="group flex min-h-28 w-full items-center gap-4 rounded-3xl border border-[var(--studio-border)] bg-[var(--studio-surface)] p-4 text-left shadow-sm outline-none transition-[background-color,box-shadow,transform] hover:bg-[var(--studio-surface-subtle)] hover:shadow-md active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[var(--studio-icon-border)] bg-[var(--studio-icon-surface)] text-[var(--studio-accent-text)]">
                  <Icon aria-hidden="true" className="h-7 w-7" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-[var(--workspace-text-primary)]">
                    {label}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-[var(--workspace-text-muted)]">
                    {t(TOOL_DESCRIPTION_KEYS[toolId])}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 text-[var(--studio-accent-text)] transition-transform group-hover:translate-x-0.5"
                />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
