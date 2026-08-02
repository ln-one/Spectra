"use client";

import type { Body, Meta, UploadResult, UppyFile } from "@uppy/core";
import { useDropzone, useUppyContext } from "@uppy/react";
import { UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DragEvent as ReactDragEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { SOURCE_FILE_EXTENSIONS } from "../validation";

const supportedFormats = SOURCE_FILE_EXTENSIONS.map((extension) => extension.toUpperCase()).join(
  " · ",
);

function containsFiles(event: Event) {
  const dataTransfer = (event as DragEvent).dataTransfer;
  return (
    Array.from(dataTransfer?.types ?? []).includes("Files") || (dataTransfer?.files.length ?? 0) > 0
  );
}

export function SourceDropTarget({
  children,
  disabled = false,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  const t = useTranslations("Sources");
  const { uppy } = useUppyContext();
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const dragDepth = useRef(0);
  const { getRootProps } = useDropzone({
    noClick: true,
    onDragEnter: (event) => {
      if (!containsFiles(event)) return;
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
  });
  const rootProps = getRootProps();

  useEffect(() => {
    function handleUploadStart(files: UppyFile<Meta, Body>[]) {
      setAnnouncement(t("announcements.uploading", { count: files.length }));
    }

    function handleComplete(result: UploadResult<Meta, Body>) {
      const failed = result.failed?.length ?? 0;
      const successful = result.successful?.length ?? 0;
      setAnnouncement(
        failed > 0
          ? t("announcements.finishedWithFailures", { failed, successful })
          : t("announcements.finished", { count: successful }),
      );
    }

    uppy.on("upload-start", handleUploadStart);
    uppy.on("complete", handleComplete);
    return () => {
      uppy.off("upload-start", handleUploadStart);
      uppy.off("complete", handleComplete);
    };
  }, [t, uppy]);

  function handleDrop(event: ReactDragEvent<HTMLElement>) {
    dragDepth.current = 0;
    setDragging(false);
    rootProps.onDrop(event as Parameters<typeof rootProps.onDrop>[0]);
  }

  return (
    <section
      data-testid="source-drop-target"
      aria-label={t("dropArea")}
      className="relative h-full"
      onDragEnter={disabled ? undefined : rootProps.onDragEnter}
      onDragOver={disabled ? undefined : rootProps.onDragOver}
      onDragLeave={disabled ? undefined : rootProps.onDragLeave}
      onDrop={disabled ? undefined : handleDrop}
    >
      {children}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-[var(--workspace-accent)] bg-[var(--workspace-surface-elevated)]/95 text-center shadow-lg">
          <div>
            <UploadCloud className="mx-auto h-7 w-7 text-[var(--workspace-accent)]" />
            <p className="mt-2 text-sm font-semibold">{t("dropToUpload")}</p>
            <p className="mt-1 px-4 text-[10px] text-[var(--workspace-text-muted)]">
              {t("supportedFiles", { formats: supportedFormats })}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
