"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useFileInput } from "@uppy/react";
import { ChevronDown, FolderInput, Link2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";

export function SourceImportControl({
  onReferenceWorkspace,
}: {
  onReferenceWorkspace: () => void;
}) {
  const t = useTranslations("Sources");
  const { getButtonProps, getInputProps } = useFileInput();

  return (
    <>
      <input {...getInputProps()} hidden />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={t("import")}
            className="workspace-sources-import-action flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-[var(--workspace-text-muted)] transition-[color,background-color,box-shadow,transform] hover:bg-[var(--workspace-surface-muted)] hover:text-[var(--workspace-text-primary)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] data-[state=open]:bg-[var(--workspace-surface-muted)] data-[state=open]:text-[var(--workspace-text-primary)]"
          >
            <Upload className="h-3.5 w-3.5 shrink-0" />
            <span className="workspace-sources-import-label">{t("import")}</span>
            <ChevronDown className="workspace-sources-import-chevron h-3 w-3" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-[110] min-w-52 rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-1.5 text-[var(--app-text)] shadow-xl"
          >
            <DropdownMenu.Item
              onSelect={getButtonProps().onClick}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none hover:bg-[var(--app-surface-muted)] focus:bg-[var(--app-surface-muted)]"
            >
              <FolderInput className="h-4 w-4" />
              {t("uploadFiles")}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={onReferenceWorkspace}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none hover:bg-[var(--app-surface-muted)] focus:bg-[var(--app-surface-muted)]"
            >
              <Link2 className="h-4 w-4" />
              <span>{t("referenceWorkspace")}</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}
