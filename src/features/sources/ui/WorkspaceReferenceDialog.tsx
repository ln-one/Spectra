"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { QueryKey } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Link2, LoaderCircle, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import type { SourceActionErrorCode, SourceClientActions } from "../client-actions";
import type { Source, WorkspaceReferenceCandidate } from "../types";
import { SourcePresentationIcon } from "./SourcePresentationIcon";
import { workspaceSourcePresentation } from "./source-file-presentation";

function looksLikeWorkspaceLocator(value: string) {
  const normalized = value.trim();
  if (/^https?:\/\//i.test(normalized)) return true;
  return /^[^/\s]+\/[^/\s]+$/.test(normalized);
}

export function WorkspaceReferenceDialog({
  actions,
  errorMessage,
  onOpenChange,
  open,
  sourceQueryKey,
  workspaceId,
}: {
  actions: SourceClientActions;
  errorMessage: (code: SourceActionErrorCode) => string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sourceQueryKey: QueryKey;
  workspaceId: string;
}) {
  const t = useTranslations("Sources.workspaceReference");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [addingWorkspaceId, setAddingWorkspaceId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const candidatesQuery = useQuery({
    queryKey: ["workspace", workspaceId, "reference-candidates"],
    enabled: open,
    staleTime: 0,
    queryFn: async () => {
      const result = await actions.listReferenceCandidates(workspaceId);
      if (result.ok) return result.data;
      throw new Error(errorMessage(result.code));
    },
  });
  const normalizedKeyword = keyword.trim().toLocaleLowerCase(locale);
  const linkInput = looksLikeWorkspaceLocator(keyword);
  const locatorQuery = useQuery({
    queryKey: ["workspace", workspaceId, "reference-locator", keyword.trim()],
    enabled: open && linkInput,
    retry: false,
    queryFn: async () => {
      const result = await actions.resolveReferenceLocator(workspaceId, keyword.trim());
      if (result.ok) return result.data;
      throw new Error(
        result.code === "source_not_found" ? t("linkNotFound") : errorMessage(result.code),
      );
    },
  });
  const visibleCandidates = useMemo(() => {
    if (linkInput) return [];
    return (candidatesQuery.data?.candidates ?? []).filter((candidate) => {
      const searchable = `${candidate.name} ${candidate.ownerHandle}`.toLocaleLowerCase(locale);
      return searchable.includes(normalizedKeyword);
    });
  }, [candidatesQuery.data?.candidates, linkInput, locale, normalizedKeyword]);
  const ownedCandidates = visibleCandidates.filter(
    (candidate) => candidate.relationship === "owned",
  );
  const sharedCandidates = visibleCandidates.filter(
    (candidate) => candidate.relationship === "shared",
  );
  const publicCandidates = visibleCandidates.filter(
    (candidate) => candidate.relationship === "public",
  );
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
    [locale],
  );

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && addingWorkspaceId) return;
    if (!nextOpen) {
      setKeyword("");
      setActionError(null);
    }
    onOpenChange(nextOpen);
  }

  async function addReference(targetWorkspaceId: string) {
    setAddingWorkspaceId(targetWorkspaceId);
    setActionError(null);
    try {
      const result = await actions.addReference(workspaceId, targetWorkspaceId);
      if (!result.ok) {
        setActionError(errorMessage(result.code));
        return;
      }
      queryClient.setQueryData<Source[]>(sourceQueryKey, (current) => {
        if (!current) return [result.data];
        const index = current.findIndex((source) => source.id === result.data.id);
        if (index === -1) return [...current, result.data];
        return current.map((source) => (source.id === result.data.id ? result.data : source));
      });
      await queryClient.invalidateQueries({
        queryKey: ["workspace", workspaceId, "reference-candidates"],
      });
      setKeyword("");
      setActionError(null);
      onOpenChange(false);
    } catch {
      setActionError(t("actionFailed"));
    } finally {
      setAddingWorkspaceId(null);
    }
  }

  const noOtherWorkspaces = candidatesQuery.data?.totalOtherWorkspaces === 0;
  const allReferenced =
    (candidatesQuery.data?.totalOtherWorkspaces ?? 0) > 0 &&
    candidatesQuery.data?.candidates.length === 0;

  function candidateRow(candidate: WorkspaceReferenceCandidate) {
    return (
      <div
        key={candidate.id}
        className="flex items-center gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 transition-colors hover:border-[var(--app-border-strong)]"
      >
        <SourcePresentationIcon
          className="h-10 w-10 rounded-xl"
          iconClassName="h-5 w-5"
          presentation={workspaceSourcePresentation()}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{candidate.name}</p>
          <p className="mt-0.5 truncate text-xs text-[var(--app-text-muted)]">
            {t("ownerAndUpdatedAt", {
              owner: candidate.ownerHandle,
              date: dateFormatter.format(new Date(candidate.updatedAt)),
            })}
          </p>
        </div>
        <button
          type="button"
          disabled={addingWorkspaceId !== null}
          onClick={() => void addReference(candidate.id)}
          className="inline-flex h-8 min-w-16 items-center justify-center gap-1.5 rounded-full bg-[var(--app-primary)] px-4 text-xs font-semibold text-[var(--app-on-primary)] shadow-sm transition-[transform,opacity,box-shadow] hover:opacity-90 hover:shadow active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-surface)] disabled:cursor-wait disabled:opacity-60 disabled:active:scale-100"
        >
          {addingWorkspaceId === candidate.id ? (
            <LoaderCircle
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
            />
          ) : null}
          {addingWorkspaceId === candidate.id ? t("adding") : t("add")}
        </button>
      </div>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[121] flex max-h-[min(680px,calc(100vh-2rem))] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] text-[var(--app-text)] shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--app-border)] px-5 py-4">
            <div>
              <Dialog.Title className="text-lg font-semibold">{t("title")}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[var(--app-text-muted)]">
                {t("description")}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={addingWorkspaceId !== null}
                aria-label={t("close")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--app-text-muted)] transition-colors hover:bg-[var(--app-surface-muted)] hover:text-[var(--app-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="border-b border-[var(--app-border)] px-5 py-4">
            <label className="relative block">
              <span className="sr-only">{t("searchLabel")}</span>
              {linkInput ? (
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-text-muted)]" />
              ) : (
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-text-muted)]" />
              )}
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder={t("searchPlaceholder")}
                className="h-11 w-full rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface-muted)] pl-9 pr-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-[var(--studio-ring)]"
              />
            </label>
          </div>

          <div className="min-h-36 flex-1 overflow-y-auto p-3">
            {linkInput ? (
              locatorQuery.isPending ? (
                <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl bg-[var(--app-surface-muted)]/55 px-6 py-8 text-center">
                  <LoaderCircle className="h-5 w-5 animate-spin text-[var(--app-text-muted)] motion-reduce:animate-none" />
                  <p className="mt-3 text-sm text-[var(--app-text-muted)]">
                    {t("linkPreviewPending")}
                  </p>
                </div>
              ) : locatorQuery.isError ? (
                <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl bg-[var(--app-surface-muted)]/55 px-6 py-8 text-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--app-surface)] text-[var(--app-text-muted)] shadow-sm">
                    <Link2 className="h-4.5 w-4.5" />
                  </span>
                  <p role="alert" className="mt-3 text-sm text-[var(--app-text-muted)]">
                    {locatorQuery.error.message}
                  </p>
                </div>
              ) : locatorQuery.data ? (
                <div className="space-y-2">
                  {candidateRow(locatorQuery.data.candidate)}
                  <p className="px-2 text-xs leading-5 text-[var(--app-text-muted)]">
                    {locatorQuery.data.resolvedFromRedirect
                      ? t("redirectResolved", {
                          address: locatorQuery.data.candidate.canonicalHref,
                        })
                      : locatorQuery.data.candidate.canonicalHref}
                  </p>
                </div>
              ) : null
            ) : candidatesQuery.isPending ? (
              <p className="px-2 py-8 text-center text-sm text-[var(--app-text-muted)]">
                {t("loading")}
              </p>
            ) : candidatesQuery.isError ? (
              <div className="px-2 py-8 text-center">
                <p role="alert" className="text-sm text-[var(--app-danger)]">
                  {candidatesQuery.error.message}
                </p>
                <button
                  type="button"
                  onClick={() => void candidatesQuery.refetch()}
                  className="mt-3 rounded-lg border border-[var(--app-border-strong)] px-3 py-1.5 text-sm"
                >
                  {t("retry")}
                </button>
              </div>
            ) : noOtherWorkspaces ? (
              <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl bg-[var(--app-surface-muted)]/55 px-6 py-7 text-center">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--app-surface)] text-[var(--app-text-muted)] shadow-sm">
                  <Link2 className="h-4 w-4" />
                </span>
                <p className="mt-3 text-sm font-medium text-[var(--app-text)]">
                  {t("noOtherWorkspaces")}
                </p>
                <p className="mt-1 text-xs text-[var(--app-text-muted)]">{t("pasteLinkHint")}</p>
              </div>
            ) : allReferenced ? (
              <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl bg-[var(--app-surface-muted)]/55 px-6 py-7 text-center">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--app-surface)] text-[var(--app-text-muted)] shadow-sm">
                  <Check className="h-4 w-4" />
                </span>
                <p className="mt-3 text-sm font-medium text-[var(--app-text)]">
                  {t("allReferenced")}
                </p>
                <p className="mt-1 text-xs text-[var(--app-text-muted)]">{t("pasteLinkHint")}</p>
              </div>
            ) : visibleCandidates.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-[var(--app-text-muted)]">
                {t("noSearchResults")}
              </p>
            ) : (
              <div className="space-y-2">
                {ownedCandidates.length > 0 ? (
                  <>
                    <p className="px-2 pb-1 pt-1 text-xs font-semibold text-[var(--app-text-muted)]">
                      {t("ownedSection")}
                    </p>
                    {ownedCandidates.map(candidateRow)}
                  </>
                ) : null}
                {sharedCandidates.length > 0 ? (
                  <>
                    <p className="px-2 pb-1 pt-3 text-xs font-semibold text-[var(--app-text-muted)]">
                      {t("sharedSection")}
                    </p>
                    {sharedCandidates.map(candidateRow)}
                  </>
                ) : null}
                {publicCandidates.length > 0 ? (
                  <>
                    <p className="px-2 pb-1 pt-3 text-xs font-semibold text-[var(--app-text-muted)]">
                      {t("publicSection")}
                    </p>
                    {publicCandidates.map(candidateRow)}
                  </>
                ) : null}
              </div>
            )}
            {actionError ? (
              <p role="alert" className="mt-3 px-2 text-sm text-[var(--app-danger)]">
                {actionError}
              </p>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
