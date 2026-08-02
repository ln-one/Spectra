"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy, LoaderCircle, Search, Share2, ShieldCheck, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceInviteCandidate, WorkspaceSharingState } from "../sharing.server";
import type {
  WorkspaceInviteSearchAction,
  WorkspaceSharingFormAction,
  WorkspaceSharingFormState,
} from "./types";

export function WorkspaceShareDialog({
  action,
  initialState,
  ownerHandle,
  searchAction,
  workspaceId,
}: {
  action: WorkspaceSharingFormAction;
  initialState: WorkspaceSharingState;
  ownerHandle: string;
  searchAction: WorkspaceInviteSearchAction;
  workspaceId: string;
}) {
  const t = useTranslations("Workbench");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteCandidates, setInviteCandidates] = useState<WorkspaceInviteCandidate[]>([]);
  const [inviteSearchState, setInviteSearchState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [selectedInvite, setSelectedInvite] = useState<WorkspaceInviteCandidate | null>(null);
  const inviteSearchRequest = useRef(0);
  const [state, formAction, pending] = useActionState<WorkspaceSharingFormState, FormData>(action, {
    code: null,
    data: initialState,
  });
  const path = state.data.slug
    ? `/${encodeURIComponent(ownerHandle)}/${encodeURIComponent(state.data.slug)}`
    : null;
  const canonicalAddress = useMemo(() => {
    if (!path) return "";
    if (typeof window === "undefined") return path;
    return new URL(path, window.location.origin).toString();
  }, [path]);
  const error = state.code ? t(`shareErrors.${state.code}`) : null;

  useEffect(() => {
    const query = inviteQuery.trim();
    if (!open || !state.data.canManage || selectedInvite || query.length < 2) {
      inviteSearchRequest.current += 1;
      setInviteCandidates([]);
      setInviteSearchState("idle");
      return;
    }
    const requestId = inviteSearchRequest.current + 1;
    inviteSearchRequest.current = requestId;
    setInviteSearchState("loading");
    const timeout = window.setTimeout(async () => {
      const result = await searchAction(workspaceId, query);
      if (inviteSearchRequest.current !== requestId) return;
      setInviteCandidates(result.candidates);
      setInviteSearchState(result.ok ? "ready" : "error");
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [inviteQuery, open, searchAction, selectedInvite, state.data.canManage, workspaceId]);

  useEffect(() => {
    if (
      selectedInvite &&
      state.data.members.some((member) => member.principalId === selectedInvite.principalId)
    ) {
      setInviteQuery("");
      setSelectedInvite(null);
      setInviteCandidates([]);
      setInviteSearchState("idle");
    }
  }, [selectedInvite, state.data.members]);

  const referenceabilitySetting = (
    <div className="flex items-center gap-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t("shareReferenceability")}</p>
        <p className="mt-0.5 text-xs leading-5 text-[var(--app-text-muted)]">
          {t("shareReferenceabilityDescription", {
            referenceable: state.data.referenceable ? "true" : "false",
          })}
        </p>
      </div>
      <fieldset
        className="flex shrink-0 rounded-full border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-1"
        aria-label={t("shareReferenceability")}
      >
        {([false, true] as const).map((referenceable) => (
          <form key={String(referenceable)} action={formAction}>
            <input type="hidden" name="intent" value="referenceability" />
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="referenceable" value={referenceable ? "true" : "false"} />
            <button
              type="submit"
              aria-pressed={state.data.referenceable === referenceable}
              disabled={
                pending || !state.data.canManage || state.data.referenceable === referenceable
              }
              className={`h-8 min-w-12 rounded-full px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-default ${
                state.data.referenceable === referenceable
                  ? referenceable
                    ? "bg-emerald-100 text-emerald-800 shadow-sm dark:bg-emerald-900/60 dark:text-emerald-200"
                    : "bg-[var(--app-primary)] text-[var(--app-on-primary)] shadow-sm"
                  : "text-[var(--app-text-muted)] hover:text-[var(--app-text)] disabled:opacity-70"
              }`}
            >
              {t(referenceable ? "shareReferenceable" : "shareNotReferenceable")}
            </button>
          </form>
        ))}
      </fieldset>
    </div>
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="workspace-header-control workspace-header-action-btn flex h-[var(--workspace-control-height)] w-9 items-center justify-center rounded-full border border-transparent transition-colors hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)]"
          aria-label={t("share")}
        >
          <Share2 className="h-4 w-4" />
        </button>
      </Dialog.Trigger>
      {open ? (
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[121] max-h-[min(760px,calc(100vh-2rem))] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-6 text-[var(--app-text)] shadow-2xl focus:outline-none">
            <Dialog.Title className="pr-10 text-xl font-semibold">{t("shareTitle")}</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-[var(--app-text-muted)]">
              {t("shareDescription")}
            </Dialog.Description>
            <Dialog.Close asChild>
              <button
                type="button"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)]"
                aria-label={t("closeShare")}
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>

            {!state.data.slug && state.data.canManage ? (
              <form
                action={formAction}
                className="mt-6 rounded-xl border border-[var(--app-border)] p-4"
              >
                <input type="hidden" name="intent" value="slug" />
                <input type="hidden" name="workspaceId" value={workspaceId} />
                <label htmlFor="share-workspace-slug" className="text-sm font-semibold">
                  {t("shareCreateAddress")}
                </label>
                <div className="mt-2 flex gap-2">
                  <span className="flex h-10 items-center text-sm text-[var(--app-text-muted)]">
                    /{ownerHandle}/
                  </span>
                  <input
                    id="share-workspace-slug"
                    name="slug"
                    required
                    maxLength={100}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-surface-muted)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--workspace-accent)]"
                    placeholder={t("workspaceSlugPlaceholder")}
                  />
                  <button
                    type="submit"
                    disabled={pending}
                    className="h-10 rounded-lg bg-[var(--app-primary)] px-4 text-sm font-semibold text-[var(--app-on-primary)] disabled:opacity-60"
                  >
                    {t("shareCreate")}
                  </button>
                </div>
                <p className="mt-2 text-xs text-[var(--app-text-muted)]">
                  {t("shareAddressPermanentHint")}
                </p>
              </form>
            ) : null}

            {state.data.slug ? (
              <>
                {state.data.canManage ? (
                  <form action={formAction} className="mt-6">
                    <input type="hidden" name="intent" value="invite" />
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <input
                      type="hidden"
                      name="identity"
                      value={selectedInvite?.handle ?? inviteQuery.trim()}
                    />
                    <div className="flex gap-2">
                      <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--app-text-faint)]" />
                        <input
                          type="search"
                          role="combobox"
                          aria-label={t("shareInviteSearchLabel")}
                          aria-autocomplete="list"
                          aria-controls="workspace-invite-candidates"
                          aria-expanded={
                            !selectedInvite &&
                            inviteQuery.trim().length >= 2 &&
                            inviteSearchState !== "idle"
                          }
                          autoComplete="off"
                          maxLength={100}
                          value={inviteQuery}
                          onChange={(event) => {
                            setInviteQuery(event.target.value);
                            setSelectedInvite(null);
                          }}
                          className="pointer-focus-outline h-11 w-full rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface-muted)] pl-9 pr-10 text-sm outline-none focus:ring-0"
                          placeholder={t("shareInvitePlaceholder")}
                        />
                        {inviteSearchState === "loading" ? (
                          <LoaderCircle className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-[var(--app-text-faint)]" />
                        ) : null}
                        {!selectedInvite &&
                        inviteQuery.trim().length >= 2 &&
                        inviteSearchState !== "idle" ? (
                          <div
                            id="workspace-invite-candidates"
                            role="listbox"
                            className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-10 overflow-hidden rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-1.5 shadow-xl"
                          >
                            {inviteSearchState === "loading" ? (
                              <p className="px-3 py-2 text-xs text-[var(--app-text-muted)]">
                                {t("shareInviteSearching")}
                              </p>
                            ) : inviteSearchState === "error" ? (
                              <p className="px-3 py-2 text-xs text-[var(--app-danger)]">
                                {t("shareInviteSearchFailed")}
                              </p>
                            ) : inviteCandidates.length === 0 ? (
                              <p className="px-3 py-2 text-xs text-[var(--app-text-muted)]">
                                {t("shareInviteNoResults")}
                              </p>
                            ) : (
                              inviteCandidates.map((candidate) => (
                                <button
                                  key={candidate.principalId}
                                  type="button"
                                  role="option"
                                  aria-selected={false}
                                  onClick={() => {
                                    setSelectedInvite(candidate);
                                    setInviteQuery(candidate.email ?? `@${candidate.handle}`);
                                    setInviteCandidates([]);
                                    setInviteSearchState("idle");
                                  }}
                                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-[var(--app-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)]"
                                >
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--app-surface-muted)] text-xs font-semibold">
                                    {candidate.handle.slice(0, 1).toUpperCase()}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium">
                                      @{candidate.handle}
                                    </span>
                                    {candidate.email ? (
                                      <span className="block truncate text-xs text-[var(--app-text-muted)]">
                                        {candidate.email}
                                      </span>
                                    ) : null}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="submit"
                        disabled={pending || inviteQuery.trim().length === 0}
                        className="h-11 rounded-xl bg-[var(--app-primary)] px-4 text-sm font-semibold text-[var(--app-on-primary)] disabled:opacity-60"
                      >
                        {t("shareInvite")}
                      </button>
                    </div>
                  </form>
                ) : null}

                {state.data.members.length > 0 ? (
                  <section className="mt-5">
                    <h3 className="text-sm font-semibold">{t("sharePeople")}</h3>
                    <div className="mt-2 divide-y divide-[var(--app-border)] rounded-xl border border-[var(--app-border)]">
                      {state.data.members.map((member) => (
                        <div key={member.principalId} className="flex items-center gap-3 px-3 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">@{member.handle}</p>
                            <p className="truncate text-xs text-[var(--app-text-muted)]">
                              {member.email ?? t("sharePermissionSummary")}
                            </p>
                          </div>
                          <span className="hidden text-xs text-[var(--app-text-muted)] sm:block">
                            {t("sharePermissionSummary")}
                          </span>
                          {state.data.canManage ? (
                            <form action={formAction}>
                              <input type="hidden" name="intent" value="revoke" />
                              <input type="hidden" name="workspaceId" value={workspaceId} />
                              <input type="hidden" name="principalId" value={member.principalId} />
                              <button
                                type="submit"
                                disabled={pending}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:bg-[var(--app-danger-bg)] hover:text-[var(--app-danger)] disabled:opacity-50"
                                aria-label={t("shareRevokeNamed", { handle: member.handle })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </form>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="mt-5 space-y-2">
                  {referenceabilitySetting}
                  <div className="flex items-center gap-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{t("shareVisibility")}</p>
                      <p className="mt-0.5 text-xs leading-5 text-[var(--app-text-muted)]">
                        {t("shareVisibilityDescription", {
                          visibility: state.data.visibility,
                        })}
                      </p>
                    </div>
                    <fieldset
                      className="flex shrink-0 rounded-full border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-1"
                      aria-label={t("shareVisibility")}
                    >
                      {(["private", "public"] as const).map((visibility) => (
                        <form key={visibility} action={formAction}>
                          <input type="hidden" name="intent" value="visibility" />
                          <input type="hidden" name="workspaceId" value={workspaceId} />
                          <input type="hidden" name="visibility" value={visibility} />
                          <button
                            type="submit"
                            aria-pressed={state.data.visibility === visibility}
                            disabled={
                              pending ||
                              !state.data.canManage ||
                              state.data.visibility === visibility
                            }
                            onClick={() => setCopied(false)}
                            className={`h-8 rounded-full px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-default ${
                              state.data.visibility === visibility
                                ? visibility === "public"
                                  ? "bg-emerald-100 text-emerald-800 shadow-sm dark:bg-emerald-900/60 dark:text-emerald-200"
                                  : "bg-[var(--app-primary)] text-[var(--app-on-primary)] shadow-sm"
                                : "text-[var(--app-text-muted)] hover:text-[var(--app-text)] disabled:opacity-70"
                            }`}
                          >
                            {t(visibility === "private" ? "sharePrivate" : "sharePublic")}
                          </button>
                        </form>
                      ))}
                    </fieldset>
                  </div>
                </section>

                {state.data.visibility === "public" ? (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-2">
                    <span className="min-w-0 flex-1 truncate px-2 text-sm">{canonicalAddress}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(canonicalAddress);
                        setCopied(true);
                      }}
                      className="flex h-9 items-center gap-2 rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-3 text-sm font-medium"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied ? t("shareCopied") : t("shareCopyLink")}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            {!state.data.slug && state.data.referenceable ? (
              <div className="mt-2">{referenceabilitySetting}</div>
            ) : null}

            <div className="mt-5 flex items-center gap-3 rounded-xl bg-emerald-50/80 p-4 dark:bg-emerald-950/30">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shadow-sm dark:bg-emerald-900/60 dark:text-emerald-300">
                <ShieldCheck className="h-[22px] w-[22px]" />
              </span>
              <p className="text-sm leading-5 text-[var(--app-text-muted)]">
                {t("sharePrivacyNotice")}
              </p>
            </div>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-[var(--app-danger)]">
                {error}
              </p>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      ) : null}
    </Dialog.Root>
  );
}
