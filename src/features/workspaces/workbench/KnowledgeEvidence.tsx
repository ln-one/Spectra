"use client";

import * as Popover from "@radix-ui/react-popover";
import { useQuery } from "@tanstack/react-query";
import { Network, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type ComponentPropsWithoutRef,
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { WorkspaceSourceIcon } from "@/components/icons/WorkspaceSourceIcon";
import {
  extractKnowledgeEvidence,
  extractRenderableKnowledgeVisualEvidenceIds,
  type KnowledgeCitationEvidence,
  parseKnowledgeEvidenceHref,
} from "@/features/agents/knowledge-citation-contract";
import {
  type KnowledgeEvidenceContext as KnowledgeEvidenceContextResponse,
  knowledgeEvidenceContextSchema,
} from "@/features/knowledge/evidence-context";
import {
  SourcePresentationIcon,
  sourceIconStyle,
} from "@/features/sources/ui/SourcePresentationIcon";
import { sourcePresentationFromHint } from "@/features/sources/ui/source-file-presentation";
import {
  knowledgeCitationDisplayNumbers,
  knowledgeVisualEvidencePlacement,
} from "./knowledge-evidence-projection";

type KnowledgeEvidenceContextValue = {
  byId: ReadonlyMap<string, KnowledgeCitationEvidence>;
  displayNumbers: ReadonlyMap<string, number>;
  evidence: readonly KnowledgeCitationEvidence[];
  visualEvidenceByToken: ReadonlyMap<string, KnowledgeCitationEvidence>;
  visualEvidenceTokensByPartIndex: ReadonlyMap<number, readonly string[]>;
  workspaceId: string;
  onOpenKnowledgeNetwork?: ((evidence: KnowledgeCitationEvidence) => void) | undefined;
};

const KnowledgeEvidenceContext = createContext<KnowledgeEvidenceContextValue | null>(null);

function evidenceLocation(evidence: KnowledgeCitationEvidence) {
  const locator = evidence.locator;
  switch (locator.kind) {
    case "text_range":
      return `${locator.start}–${locator.end}`;
    case "page_region":
      return `P${locator.pageIndex + 1}`;
    case "page_regions":
      return locator.regions.map((region) => `P${region.pageIndex + 1}`).join(", ");
    case "grid_range":
      return `${locator.sheetId}!${locator.range}`;
    case "structured_path":
      return locator.path || "/";
    case "cue_range":
    case "media_range":
      return `${(locator.startMs / 1000).toFixed(1)}s–${(locator.endMs / 1000).toFixed(1)}s`;
    case "notebook_cell":
      return locator.cellId;
    case "code_range":
      return `L${locator.startLine}–L${locator.endLine}`;
  }
}

function evidenceLocationLabel(evidence: KnowledgeCitationEvidence) {
  switch (evidence.locator.kind) {
    case "text_range":
      return "knowledgeEvidenceTextLocation" as const;
    case "page_region":
    case "page_regions":
      return "knowledgeEvidencePageLocation" as const;
    case "grid_range":
      return "knowledgeEvidenceGridLocation" as const;
    case "structured_path":
      return "knowledgeEvidencePathLocation" as const;
    case "cue_range":
    case "media_range":
      return "knowledgeEvidenceTimeLocation" as const;
    case "notebook_cell":
      return "knowledgeEvidenceCellLocation" as const;
    case "code_range":
      return "knowledgeEvidenceCodeLocation" as const;
  }
}

function evidenceText(evidence: KnowledgeCitationEvidence) {
  if (evidence.exactExcerpt) return evidence.exactExcerpt;
  if ("content" in evidence && evidence.content.kind === "visual_region") {
    return evidence.content.accessibleDescription ?? evidence.sourceName;
  }
  return evidence.sourceName;
}

export function KnowledgeEvidenceBoundary({
  children,
  isStreaming = false,
  parts,
  visibleTextPartIndexes,
  workspaceId,
  onOpenKnowledgeNetwork,
}: {
  children: ReactNode;
  isStreaming?: boolean;
  parts: readonly unknown[];
  visibleTextPartIndexes: ReadonlySet<number>;
  workspaceId: string;
  onOpenKnowledgeNetwork?: ((evidence: KnowledgeCitationEvidence) => void) | undefined;
}) {
  const bundle = useMemo(() => extractKnowledgeEvidence(parts), [parts]);
  const byId = useMemo(() => new Map(bundle.map((unit) => [unit.citationToken, unit])), [bundle]);
  const displayNumbers = useMemo(
    () => knowledgeCitationDisplayNumbers(parts, bundle),
    [bundle, parts],
  );
  const renderableVisualEvidenceIds = useMemo(
    () => extractRenderableKnowledgeVisualEvidenceIds(parts),
    [parts],
  );
  const visualEvidence = useMemo(
    () =>
      bundle.filter(
        (evidence) =>
          renderableVisualEvidenceIds.has(evidence.evidenceId) &&
          evidence.content.kind === "visual_region",
      ),
    [bundle, renderableVisualEvidenceIds],
  );
  const visualEvidenceByToken = useMemo(
    () => new Map(visualEvidence.map((evidence) => [evidence.citationToken, evidence])),
    [visualEvidence],
  );
  const visualPlacement = useMemo(
    () =>
      knowledgeVisualEvidencePlacement(
        parts,
        bundle,
        visualEvidence,
        visibleTextPartIndexes,
        isStreaming,
      ),
    [bundle, isStreaming, parts, visibleTextPartIndexes, visualEvidence],
  );
  const value = useMemo(
    () => ({
      byId,
      displayNumbers,
      evidence: bundle,
      visualEvidenceByToken,
      visualEvidenceTokensByPartIndex: visualPlacement.tokensByPartIndex,
      workspaceId,
      ...(onOpenKnowledgeNetwork ? { onOpenKnowledgeNetwork } : {}),
    }),
    [
      bundle,
      byId,
      displayNumbers,
      onOpenKnowledgeNetwork,
      visualEvidenceByToken,
      visualPlacement,
      workspaceId,
    ],
  );

  return (
    <KnowledgeEvidenceContext.Provider value={value}>{children}</KnowledgeEvidenceContext.Provider>
  );
}

export function useKnowledgeEvidence() {
  return useContext(KnowledgeEvidenceContext);
}

export function KnowledgeMarkdownLink({ children, href, ...props }: ComponentPropsWithoutRef<"a">) {
  const context = useContext(KnowledgeEvidenceContext);
  const citationToken = parseKnowledgeEvidenceHref(href);
  if (citationToken) {
    const evidence = context?.byId.get(citationToken);
    const displayNumber = context?.displayNumbers.get(citationToken);
    if (!context || !evidence || displayNumber === undefined) {
      return (
        <span className="text-[var(--workspace-text-muted)]" title="Unverified citation">
          {children}
        </span>
      );
    }
    return (
      <KnowledgeEvidencePopover
        evidence={evidence}
        displayNumber={displayNumber}
        onOpenKnowledgeNetwork={context.onOpenKnowledgeNetwork}
        workspaceId={context.workspaceId}
      />
    );
  }
  return (
    <a {...props} href={href}>
      {children}
    </a>
  );
}

export function KnowledgeEvidencePopover({
  evidence,
  displayNumber,
  trigger,
  workspaceId,
  onOpenKnowledgeNetwork,
}: {
  evidence: KnowledgeCitationEvidence;
  displayNumber: number;
  trigger?: ReactNode;
  workspaceId: string;
  onOpenKnowledgeNetwork?: ((evidence: KnowledgeCitationEvidence) => void) | undefined;
}) {
  const t = useTranslations("Workbench");
  const [open, setOpen] = useState(false);
  const contextQuery = useQuery({
    enabled: open && evidence.content.kind !== "visual_region" && Boolean(evidence.exactExcerpt),
    queryKey: ["knowledge-evidence-context", workspaceId, evidence.evidenceId],
    queryFn: async () => {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/knowledge/evidence/${evidence.evidenceId}/context`,
      );
      if (!response.ok) throw new Error("knowledge_evidence_context_unavailable");
      return knowledgeEvidenceContextSchema.parse(await response.json());
    },
    retry: false,
    staleTime: 5 * 60 * 1_000,
  });
  const presentation = sourcePresentationFromHint(evidence.sourcePresentation, evidence.sourceName);
  const presentationProps =
    presentation.category === "artifact"
      ? { "data-studio-tone": presentation.tone }
      : { style: sourceIconStyle(presentation.iconTone) };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label={t("openKnowledgeEvidence", {
              number: displayNumber,
              source: evidence.sourceName,
            })}
            className={`relative -top-[0.38em] mx-[0.08em] inline-flex h-[1.45em] min-w-[1.45em] items-center justify-center rounded-[0.35em] border px-[0.28em] text-[0.68em] font-semibold leading-none tabular-nums outline-none transition-[color,background-color,border-color,box-shadow] before:absolute before:-inset-1 before:rounded-md before:content-[''] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--workspace-surface-elevated)] data-[state=open]:brightness-95 ${
              presentation.category === "artifact"
                ? "workspace-artifact-source-icon"
                : "workspace-source-file-icon"
            }`}
            {...presentationProps}
            data-testid={`knowledge-citation-${displayNumber}`}
            title={`${evidence.sourceName} · ${t(evidenceLocationLabel(evidence))} ${evidenceLocation(evidence)}`}
          >
            {displayNumber}
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          aria-label={t("knowledgeEvidenceTitle")}
          collisionPadding={12}
          data-studio-tone={presentation.category === "artifact" ? presentation.tone : undefined}
          data-workspace-theme="mist-zinc"
          side="top"
          sideOffset={8}
          className="z-[120] max-h-[min(520px,calc(100vh-24px))] w-[min(460px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-[var(--workspace-border-strong)] bg-[var(--workspace-surface-elevated)] p-3.5 text-[var(--workspace-text-primary)] shadow-xl outline-none data-[state=closed]:animate-out data-[state=open]:animate-in focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
        >
          <div className="flex items-start gap-3">
            <SourcePresentationIcon
              className="h-7 w-7 rounded-md"
              iconClassName="h-3.5 w-3.5"
              presentation={presentation}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{evidence.sourceName}</p>
              <p className="mt-0.5 text-xs text-[var(--workspace-text-muted)]">
                {t("knowledgeEvidenceLocation", {
                  location: `${t(evidenceLocationLabel(evidence))} ${evidenceLocation(evidence)}`,
                })}
              </p>
              {"workspaceOrigin" in evidence &&
              evidence.workspaceOrigin?.workspaceRelation === "referenced" ? (
                <p className="mt-1 inline-flex max-w-full items-center gap-1.5 truncate text-xs font-medium text-teal-700 dark:text-teal-300">
                  <WorkspaceSourceIcon className="h-3.5 w-3.5 shrink-0" />
                  {t("knowledgeEvidenceWorkspaceOrigin", {
                    workspace: evidence.workspaceOrigin.workspaceName,
                  })}
                </p>
              ) : null}
            </div>
            {onOpenKnowledgeNetwork ? (
              <Popover.Close asChild>
                <button
                  type="button"
                  aria-label={t("openKnowledgeNetwork")}
                  title={t("openKnowledgeNetwork")}
                  onClick={() => onOpenKnowledgeNetwork(evidence)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--workspace-text-muted)] outline-none hover:bg-[var(--workspace-surface-muted)] hover:text-[var(--workspace-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
                >
                  <Network className="h-4 w-4" />
                </button>
              </Popover.Close>
            ) : null}
            <Popover.Close asChild>
              <button
                type="button"
                aria-label={t("closeKnowledgeEvidence")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--workspace-text-muted)] outline-none hover:bg-[var(--workspace-surface-muted)] hover:text-[var(--workspace-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
              >
                <X className="h-4 w-4" />
              </button>
            </Popover.Close>
          </div>
          <div className="mt-3.5 border-t border-[var(--workspace-border)] pt-3">
            <p className="text-[11px] font-medium tracking-wide text-[var(--workspace-text-muted)]">
              {contextQuery.data
                ? t("knowledgeEvidenceContext")
                : t("knowledgeEvidenceExactExcerpt")}
            </p>
            <EvidenceContextContent
              context={contextQuery.data}
              exactExcerpt={evidenceText(evidence)}
              loading={contextQuery.isPending && contextQuery.fetchStatus === "fetching"}
            />
          </div>
          <Popover.Arrow className="fill-[var(--workspace-surface-elevated)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function EvidenceContextContent({
  context,
  exactExcerpt,
  loading,
}: {
  context: KnowledgeEvidenceContextResponse | undefined;
  exactExcerpt: string;
  loading: boolean;
}) {
  if (context?.highlight) {
    const before = context.contextText.slice(0, context.highlight.start);
    const match = context.contextText.slice(context.highlight.start, context.highlight.end);
    const after = context.contextText.slice(context.highlight.end);
    return (
      <p className="mt-2 rounded-lg bg-[var(--studio-surface-subtle)] px-3 py-2.5 text-sm leading-6 whitespace-pre-wrap">
        {before}
        <mark className="rounded-sm bg-amber-200/80 px-0.5 text-inherit dark:bg-amber-400/30">
          {match}
        </mark>
        {after}
      </p>
    );
  }

  if (context) {
    return (
      <div className="mt-2 space-y-2.5">
        <p className="rounded-lg bg-[var(--studio-surface-subtle)] px-3 py-2.5 text-sm leading-6 whitespace-pre-wrap">
          {context.contextText}
        </p>
        <blockquote className="rounded-r-lg border-l-2 border-[var(--studio-border-strong)] bg-[var(--studio-surface-subtle)] py-2.5 pr-3 pl-3 text-sm leading-6 whitespace-pre-wrap">
          <mark className="rounded-sm bg-amber-200/80 px-0.5 text-inherit dark:bg-amber-400/30">
            {context.exactExcerpt}
          </mark>
        </blockquote>
      </div>
    );
  }

  return (
    <div aria-busy={loading} className="mt-2">
      {loading ? (
        <div aria-hidden="true" className="mb-2 space-y-1.5">
          <div className="h-2.5 w-full animate-pulse rounded bg-[var(--workspace-surface-muted)]" />
          <div className="h-2.5 w-3/5 animate-pulse rounded bg-[var(--workspace-surface-muted)]" />
        </div>
      ) : null}
      <blockquote className="rounded-r-lg border-l-2 border-[var(--studio-border-strong)] bg-[var(--studio-surface-subtle)] py-2.5 pr-3 pl-3 text-sm leading-6 whitespace-pre-wrap">
        {exactExcerpt}
      </blockquote>
      {loading ? (
        <div aria-hidden="true" className="mt-2 space-y-1.5">
          <div className="h-2.5 w-4/5 animate-pulse rounded bg-[var(--workspace-surface-muted)]" />
          <div className="h-2.5 w-1/2 animate-pulse rounded bg-[var(--workspace-surface-muted)]" />
        </div>
      ) : null}
    </div>
  );
}
