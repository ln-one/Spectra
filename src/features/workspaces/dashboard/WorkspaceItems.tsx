"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Archive, ArchiveRestore, BookOpen, MoreVertical, Pencil } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { type CSSProperties, startTransition } from "react";
import { workspaceHref } from "../address";
import type { Workspace } from "../types";

const LOGO_COLORS = [
  "#FF3B30",
  "#FF9500",
  "#FFCC00",
  "#4CD964",
  "#5AC8FA",
  "#007AFF",
  "#5856D6",
  "#AF52DE",
];

const SKELETON_ITEMS = ["workspace-1", "workspace-2", "workspace-3", "workspace-4"];

function workspaceSeedColors(seed: string) {
  let hash = 0;
  for (const character of seed) hash = character.charCodeAt(0) + ((hash << 5) - hash);

  return [
    LOGO_COLORS[Math.abs(hash) % LOGO_COLORS.length],
    LOGO_COLORS[Math.abs(hash + 3) % LOGO_COLORS.length],
  ] as const;
}

function workspaceGradient(seed: string) {
  const [first, second] = workspaceSeedColors(seed);
  return `radial-gradient(circle at 0% 0%, ${first}99 0%, transparent 70%), radial-gradient(circle at 100% 100%, ${second}66 0%, transparent 90%), var(--app-surface)`;
}

// Card glass: high-transparency liquid glass, not frosted. The seeded hues are
// restrained to faint tints pooling at two corners, and the base is a
// semi-transparent surface so real background light passes through (paired
// with backdrop-blur on the card). The surface token keeps dark theme intact.
function workspaceGlassGradient(seed: string) {
  const [first, second] = workspaceSeedColors(seed);
  return [
    `radial-gradient(130% 160% at 0% 0%, ${first}66 0%, transparent 68%)`,
    `radial-gradient(140% 150% at 100% 100%, ${second}59 0%, transparent 72%)`,
    "linear-gradient(165deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.06) 100%)",
    "color-mix(in srgb, var(--app-surface) 78%, transparent)",
  ].join(", ");
}

// Liquid-glass optics: crisp and small, never hazy — a tight hot spot on the
// upper-left edge, a thin light line slicing diagonally, a hard top-edge sheen
// and a soft bounce rim along the bottom. All-white layers read as glass
// highlights in both themes.
const GLASS_SHEEN = [
  "radial-gradient(28% 20% at 20% 8%, rgba(255,255,255,0.95) 0%, transparent 70%)",
  "linear-gradient(105deg, transparent 44%, rgba(255,255,255,0.55) 49%, rgba(255,255,255,0.05) 53%, transparent 58%)",
  "linear-gradient(to bottom, rgba(255,255,255,0.5) 0%, transparent 12%)",
  "radial-gradient(120% 42% at 50% 120%, rgba(255,255,255,0.4) 0%, transparent 55%)",
].join(", ");

// Edge light: a hard bright rim on top, a faint dark rim on the bottom (glass
// thickness), plus concentrated inner light just under the top edge and a dim
// inner shadow at the bottom — the curved-surface shading of clear glass.
const GLASS_INSET_RING =
  "inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(15,23,42,0.08), inset 1px 0 0 rgba(255,255,255,0.5), inset -1px 0 0 rgba(255,255,255,0.25), inset 0 10px 18px -12px rgba(255,255,255,0.9), inset 0 -14px 22px -16px rgba(15,23,42,0.12)";

function formatWorkspaceDate(
  value: string,
  now: string,
  locale: string,
  t: ReturnType<typeof useTranslations<"Dashboard">>,
) {
  const date = new Date(value);
  const reference = new Date(now);
  if (Number.isNaN(date.getTime()) || Number.isNaN(reference.getTime())) return t("unknownTime");

  const diffDays = Math.floor((reference.getTime() - date.getTime()) / 86_400_000);
  if (diffDays <= 0) return t("updatedToday");
  if (diffDays === 1) return t("updatedYesterday");
  if (diffDays < 7) return t("updatedDaysAgo", { count: diffDays });
  if (diffDays < 30) return t("updatedWeeksAgo", { count: Math.floor(diffDays / 7) });
  return t("updatedOn", {
    date: date.toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" }),
  });
}

export type WorkspaceItemActions = {
  archiveFormAction: (formData: FormData) => void;
  archivePending: boolean;
  onRename: (workspace: Workspace) => void;
};

function WorkspaceActionMenu({
  actions,
  workspace,
}: {
  actions: WorkspaceItemActions;
  workspace: Workspace;
}) {
  const t = useTranslations("Dashboard");
  const archived = workspace.archivedAt !== null;
  const operation = archived ? "restore" : "archive";
  const OperationIcon = archived ? ArchiveRestore : Archive;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={t("workspaceActions", { name: workspace.name })}
          className="relative z-20 -mr-2 -mt-2 flex h-9 w-9 items-center justify-center rounded-xl text-zinc-600 opacity-70 outline-none transition hover:bg-white/55 hover:opacity-100 focus-visible:bg-white/55 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-zinc-800/30 group-hover:opacity-100"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-[90] min-w-44 rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-1.5 text-[var(--app-text)] shadow-xl"
        >
          <DropdownMenu.Item asChild onSelect={() => actions.onRename(workspace)}>
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none hover:bg-[var(--app-surface-muted)] focus:bg-[var(--app-surface-muted)]"
            >
              <Pencil className="h-4 w-4" />
              {t("renameWorkspace")}
            </button>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={actions.archivePending}
            onSelect={() => {
              const formData = new FormData();
              formData.set("workspaceId", workspace.id);
              formData.set("operation", operation);
              startTransition(() => actions.archiveFormAction(formData));
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none hover:bg-[var(--app-surface-muted)] focus:bg-[var(--app-surface-muted)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60"
          >
            <OperationIcon className="h-4 w-4" />
            {archived ? t("restoreWorkspace") : t("archiveWorkspace")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function WorkspaceCard({
  actions,
  now,
  workspace,
}: {
  actions: WorkspaceItemActions;
  now: string;
  workspace: Workspace;
}) {
  const locale = useLocale();
  const t = useTranslations("Dashboard");
  const [accent] = workspaceSeedColors(workspace.id);
  return (
    <article
      className="group relative flex min-h-[180px] flex-col justify-between overflow-hidden rounded-[2rem] border border-white/70 p-6 shadow-[0_18px_40px_-18px_var(--card-glow)] backdrop-blur-md transition-all duration-300 ease-out hover:shadow-[0_28px_56px_-20px_var(--card-glow),0_10px_24px_-12px_rgba(15,23,42,0.18)] hover:saturate-[1.15]"
      style={
        {
          background: workspaceGlassGradient(workspace.id),
          "--card-glow": `${accent}59`,
        } as CSSProperties
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[2rem]"
        style={{ background: GLASS_SHEEN, boxShadow: GLASS_INSET_RING }}
      />
      <Link
        href={workspaceHref(workspace)}
        aria-label={t("openWorkspace", { name: workspace.name })}
        className="absolute inset-0 z-10 rounded-[2rem]"
      />
      <div className="relative flex items-start justify-between">
        <span className="rounded-full border border-white/40 bg-white/60 px-3 py-1.5 text-xs font-semibold tracking-wide text-zinc-600 shadow-sm backdrop-blur-md">
          {formatWorkspaceDate(workspace.updatedAt, now, locale, t)}
        </span>
        <WorkspaceActionMenu actions={actions} workspace={workspace} />
      </div>
      <div className="relative z-0 mt-4">
        <h3 className="line-clamp-2 text-xl font-bold leading-tight text-[var(--app-text)]">
          {workspace.name}
        </h3>
        <p className="mt-2 truncate font-mono text-xs text-[var(--app-text-muted)]">
          {workspaceHref(workspace)}
        </p>
      </div>
    </article>
  );
}

export function WorkspaceListItem({
  actions,
  now,
  workspace,
}: {
  actions: WorkspaceItemActions;
  now: string;
  workspace: Workspace;
}) {
  const locale = useLocale();
  const t = useTranslations("Dashboard");
  return (
    <article className="group relative flex items-center gap-5 rounded-[1.5rem] border border-[var(--app-border)] bg-[var(--app-surface)] p-5 transition hover:translate-x-1 hover:border-[var(--app-border-strong)] hover:shadow-md">
      <Link
        href={workspaceHref(workspace)}
        aria-label={t("openWorkspace", { name: workspace.name })}
        className="absolute inset-0 z-10 rounded-[1.5rem] outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-accent)]"
      />
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
        style={{ background: workspaceGradient(workspace.id) }}
      >
        <BookOpen className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold leading-tight text-[var(--app-text)]">
          {workspace.name}
        </span>
        <span className="mt-1 block text-xs font-medium text-[var(--app-text-faint)]">
          {formatWorkspaceDate(workspace.updatedAt, now, locale, t)}
        </span>
      </span>
      <span className="hidden text-right sm:block">
        <span className="block text-[10px] font-bold uppercase tracking-widest text-[var(--app-text-faint)]">
          {t("lastModified")}
        </span>
        <span className="text-xs font-semibold text-[var(--app-text-muted)]">
          {formatWorkspaceDate(workspace.updatedAt, now, locale, t)}
        </span>
      </span>
      <WorkspaceActionMenu actions={actions} workspace={workspace} />
    </article>
  );
}

export function WorkspaceSkeleton() {
  return (
    <div className="w-full space-y-8">
      <div className="h-10 w-44 animate-pulse rounded-full bg-[var(--app-surface-muted)]" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {SKELETON_ITEMS.map((item) => (
          <div
            key={item}
            className="h-[180px] animate-pulse rounded-[2rem] bg-[var(--app-surface-muted)]"
          />
        ))}
      </div>
    </div>
  );
}
