"use client";

import { useAuiState } from "@assistant-ui/react";
import { ChevronDown, Globe, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { useAgentRunActivity } from "./WorkbenchChatRuntime";

const webSearchPartSchema = z
  .object({
    isError: z.boolean().optional(),
    result: z.unknown().optional(),
    status: z.object({ reason: z.string().optional(), type: z.string() }).passthrough(),
    toolName: z.literal("web_search"),
    type: z.literal("tool-call"),
  })
  .passthrough();

const webSearchResultSchema = z
  .object({
    sources: z.array(z.unknown()).optional(),
  })
  .passthrough();

const webSearchUrlSourceSchema = z
  .object({ type: z.literal("url"), url: z.string() })
  .passthrough();

const textPartSchema = z.object({ type: z.literal("text"), text: z.string() }).passthrough();
const knowledgeSearchPartSchema = z
  .object({
    status: z.object({ type: z.string() }).passthrough(),
    toolName: z.literal("search_workspace"),
    type: z.literal("tool-call"),
  })
  .passthrough();

type WebSearchSource = {
  domain: string;
  url: string;
};

export function extractWebSearchEvidence(parts: readonly unknown[]): {
  hasError: boolean;
  hasText: boolean;
  isRunning: boolean;
  knowledgeSearchCount: number;
  knowledgeSearchRunning: boolean;
  sources: WebSearchSource[];
} {
  let hasError = false;
  let hasText = false;
  let isRunning = false;
  const sources: WebSearchSource[] = [];
  const seen = new Set<string>();
  const knowledgeCalls = new Set<string>();
  let knowledgeSearchRunning = false;

  for (const part of parts) {
    const parsedTextPart = textPartSchema.safeParse(part);
    if (parsedTextPart.success && parsedTextPart.data.text.trim().length > 0) hasText = true;

    const parsedKnowledgePart = knowledgeSearchPartSchema.safeParse(part);
    if (parsedKnowledgePart.success) {
      const toolCallId = Reflect.get(parsedKnowledgePart.data, "toolCallId");
      knowledgeCalls.add(
        typeof toolCallId === "string" ? toolCallId : `call-${knowledgeCalls.size}`,
      );
      if (parsedKnowledgePart.data.status.type === "running") knowledgeSearchRunning = true;
    }

    const parsedPart = webSearchPartSchema.safeParse(part);
    if (!parsedPart.success) continue;
    if (parsedPart.data.status.type === "running") isRunning = true;
    if (
      parsedPart.data.isError === true ||
      (parsedPart.data.status.type === "incomplete" && parsedPart.data.status.reason === "error")
    ) {
      hasError = true;
    }

    const parsedResult = webSearchResultSchema.safeParse(parsedPart.data.result);
    if (!parsedResult.success) continue;
    for (const source of parsedResult.data.sources ?? []) {
      const parsedSource = webSearchUrlSourceSchema.safeParse(source);
      if (!parsedSource.success) continue;
      try {
        const url = new URL(parsedSource.data.url);
        if (url.protocol !== "https:") continue;
        const normalized = url.href;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        sources.push({ domain: url.hostname.replace(/^www\./, ""), url: normalized });
      } catch {
        // Provider output is untrusted at this UI boundary; invalid URLs are not rendered.
      }
    }
  }

  return {
    hasError,
    hasText,
    isRunning,
    knowledgeSearchCount: knowledgeCalls.size,
    knowledgeSearchRunning,
    sources,
  };
}

export function AssistantRunStatus({
  isRecoveryPlaceholder = false,
}: {
  isRecoveryPlaceholder?: boolean;
} = {}) {
  const t = useTranslations("Workbench");
  const runtimeIsRunning = useAuiState((state) => state.thread.isRunning);
  const hasActiveRun = useAgentRunActivity();
  const lastMessage = useAuiState((state) => state.thread.messages.at(-1));

  if (!runtimeIsRunning && !hasActiveRun) return null;

  const evidence = extractWebSearchEvidence(
    isRecoveryPlaceholder ? [] : (lastMessage?.parts ?? []),
  );
  if (evidence.hasText) return null;

  const label =
    evidence.knowledgeSearchCount > 0
      ? evidence.knowledgeSearchRunning
        ? evidence.knowledgeSearchCount > 1
          ? t("knowledgeSearchContinuing")
          : t("knowledgeSearchRunning")
        : t("knowledgeSearchOrganizing")
      : evidence.isRunning
        ? t("webSearchRunning")
        : evidence.sources.length > 0
          ? t("webSearchOrganizing", { count: evidence.sources.length })
          : t("preparingResponse");

  return (
    <div
      aria-live="polite"
      className="flex items-center gap-1.5 py-1 text-xs text-[var(--workspace-text-muted)]"
      data-testid="assistant-run-status"
      role="status"
    >
      <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[var(--studio-accent-text)] motion-reduce:animate-none" />
      <span>{label}</span>
    </div>
  );
}

export function WebSearchEvidence() {
  const t = useTranslations("Workbench");
  const parts = useAuiState((state) => state.message.parts);
  const isLast = useAuiState((state) => state.message.isLast);
  const threadIsRunning = useAuiState((state) => state.thread.isRunning);
  const evidence = extractWebSearchEvidence(parts);
  const isCurrentRun = isLast && threadIsRunning;
  const showError = evidence.hasError && !isCurrentRun;
  const showSources = evidence.hasText && evidence.sources.length > 0 && !isCurrentRun;

  if (!showError && !showSources) return null;

  return (
    <div className="mt-2 w-full max-w-[72ch] text-xs text-[var(--workspace-text-muted)]">
      {showError ? (
        <div className="py-1 text-red-600" role="alert">
          {t("webSearchFailed")}
        </div>
      ) : null}
      {showSources ? (
        <details className="group rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 font-medium text-[var(--workspace-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] [&::-webkit-details-marker]:hidden">
            <Globe className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">
              {t("webSearchSources", { count: evidence.sources.length })}
            </span>
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <ul className="space-y-1 border-t border-[var(--workspace-border)] px-3 py-2">
            {evidence.sources.map((source) => (
              <li key={source.url} className="min-w-0">
                <a
                  className="flex min-w-0 items-baseline gap-2 rounded px-1 py-1 outline-none hover:text-[var(--workspace-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
                  href={source.url}
                  rel="noopener noreferrer"
                  target="_blank"
                  title={source.url}
                >
                  <span className="shrink-0 font-medium text-[var(--workspace-text-primary)]">
                    {source.domain}
                  </span>
                  <span className="truncate">{source.url}</span>
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
