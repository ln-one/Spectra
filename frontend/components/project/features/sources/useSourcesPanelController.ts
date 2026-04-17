"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotificationStore } from "@/stores/notificationStore";
import { useProjectStore } from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import {
  COMPACT_MODE_WIDTH,
  HEADER_COMPACT_HYSTERESIS,
  HEADER_FORCE_NORMAL_WIDTH,
  HEADER_MIN_VISIBLE_WIDTH,
  HORIZONTAL_ICON_MODE_TRIGGER_HEIGHT,
} from "./constants";
import { getUploadErrorMessage, normalizeUploadingProgress } from "./utils";
import type { SourceFocusDetail } from "./types";

interface UseSourcesPanelControllerArgs {
  projectId: string;
  isCollapsed: boolean;
  isStudioExpanded: boolean;
  isExpandedContentCollapsed: boolean;
}

export function useSourcesPanelController({
  projectId,
  isCollapsed,
  isStudioExpanded,
  isExpandedContentCollapsed,
}: UseSourcesPanelControllerArgs) {
  const {
    files,
    selectedFileIds,
    uploadFile,
    deleteFile,
    toggleFileSelection,
    activeSourceDetail,
    clearActiveSource,
  } = useProjectStore(
    useShallow((state) => ({
      files: state.files,
      selectedFileIds: state.selectedFileIds,
      uploadFile: state.uploadFile,
      deleteFile: state.deleteFile,
      toggleFileSelection: state.toggleFileSelection,
      activeSourceDetail: state.activeSourceDetail,
      clearActiveSource: state.clearActiveSource,
    }))
  );
  const { addNotification, updateNotification, replaceNotification } =
    useNotificationStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const horizontalViewportRef = useRef<HTMLDivElement>(null);
  const headerActionsRef = useRef<HTMLDivElement>(null);
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [isCompact, setIsCompact] = useState(false);
  const [isHeightTight, setIsHeightTight] = useState(false);
  const [isHeaderTight, setIsHeaderTight] = useState(false);
  const [uploadingTasksCount, setUploadingTasksCount] = useState(0);

  useEffect(() => {
    const checkWidth = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.offsetWidth;
      const height = containerRef.current.offsetHeight;
      const nextCompact = width < COMPACT_MODE_WIDTH;
      setIsCompact(nextCompact);
      setIsHeightTight((prev) => {
        if (!isStudioExpanded) return false;
        if (prev) return height <= HORIZONTAL_ICON_MODE_TRIGGER_HEIGHT + 10;
        return height <= HORIZONTAL_ICON_MODE_TRIGGER_HEIGHT;
      });

      if (nextCompact) {
        setIsHeaderTight(true);
        return;
      }
      if (width >= HEADER_FORCE_NORMAL_WIDTH) {
        setIsHeaderTight(false);
        return;
      }
      if (headerActionsRef.current) {
        const horizontalPadding = 32;
        const gap = 8;
        const availableInfoWidth =
          width -
          horizontalPadding -
          headerActionsRef.current.offsetWidth -
          gap;
        setIsHeaderTight((prev) => {
          if (prev) {
            return (
              availableInfoWidth <
              HEADER_MIN_VISIBLE_WIDTH + HEADER_COMPACT_HYSTERESIS
            );
          }
          return availableInfoWidth < HEADER_MIN_VISIBLE_WIDTH;
        });
        return;
      }
      setIsHeaderTight(true);
    };

    checkWidth();
    window.addEventListener("resize", checkWidth);
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(checkWidth)
        : null;
    if (containerRef.current) {
      resizeObserver?.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener("resize", checkWidth);
      resizeObserver?.disconnect();
    };
  }, [
    files.length,
    isStudioExpanded,
    selectedFileIds.length,
    uploadingTasksCount,
  ]);

  const focusedFileId = activeSourceDetail?.file_info?.id;
  const focusPayload = useMemo<SourceFocusDetail | null>(() => {
    if (!activeSourceDetail) return null;
    return {
      chunk_id: activeSourceDetail.chunk_id,
      content: activeSourceDetail.content,
      source: activeSourceDetail.source,
      context: activeSourceDetail.context,
    };
  }, [activeSourceDetail]);

  useEffect(() => {
    if (focusedFileId && fileRefs.current[focusedFileId]) {
      fileRefs.current[focusedFileId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [focusedFileId, activeSourceDetail?.chunk_id]);

  useEffect(() => {
    const targetId = activeSourceDetail?.file_info?.id;
    if (!targetId) return;
    const frame = requestAnimationFrame(() => {
      setExpandedIds((prev) => ({ ...prev, [targetId]: true }));
    });
    return () => cancelAnimationFrame(frame);
  }, [activeSourceDetail?.file_info?.id, activeSourceDetail?.chunk_id]);

  const collapseFile = useCallback(
    (fileId: string) => {
      setExpandedIds((prev) => ({ ...prev, [fileId]: false }));
      if (focusedFileId === fileId) {
        clearActiveSource();
      }
    },
    [focusedFileId, clearActiveSource]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;
      const selectedFiles = Array.from(fileList);

      selectedFiles.forEach((file) => {
        setUploadingTasksCount((count) => count + 1);
        const notificationId = addNotification({
          type: "upload",
          title: file.name,
          description: "上传中",
          duration: 0,
          progress: 5,
          status: "uploading",
          meta: { fileName: file.name },
        });

        void uploadFile(file, projectId, {
          onProgress: (progress) => {
            const displayProgress = normalizeUploadingProgress(progress);
            updateNotification(notificationId, {
              progress: displayProgress,
              status: "uploading",
              description: "上传中",
              duration: 0,
            });
          },
        })
          .then((uploadedFile) => {
            replaceNotification(notificationId, {
              type: "upload",
              title: file.name,
              description: "解析中",
              duration: 0,
              progress: 95,
              status: "parsing",
              meta: { fileName: file.name, fileId: uploadedFile?.id },
            });

            window.setTimeout(() => {
              replaceNotification(notificationId, {
                type: "success",
                title: file.name,
                description: "上传成功",
                duration: 3000,
                progress: 100,
                status: "success",
                meta: { fileName: file.name, fileId: uploadedFile?.id },
              });
            }, 450);
          })
          .catch((error) => {
            replaceNotification(notificationId, {
              type: "error",
              title: file.name,
              description: getUploadErrorMessage(error),
              duration: 6000,
              progress: 95,
              status: "failed",
              meta: { fileName: file.name },
            });
          })
          .finally(() => {
            setUploadingTasksCount((count) => Math.max(0, count - 1));
          });
      });

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [
      addNotification,
      projectId,
      replaceNotification,
      updateNotification,
      uploadFile,
    ]
  );

  const handleDelete = useCallback(
    async (fileId: string) => {
      await deleteFile(fileId);
    },
    [deleteFile]
  );

  const registerFileRef = useCallback(
    (id: string, el: HTMLDivElement | null) => {
      fileRefs.current[id] = el;
    },
    []
  );

  const isHorizontalIconMode =
    isStudioExpanded && (isExpandedContentCollapsed || isHeightTight);
  const isEffectiveCompact = isCompact || isCollapsed || isHorizontalIconMode;
  const isHeaderCompact = isStudioExpanded
    ? isCompact || isCollapsed || isHeaderTight
    : isCollapsed;

  return {
    files,
    selectedFileIds,
    toggleFileSelection,
    focusedFileId,
    focusPayload,
    fileInputRef,
    containerRef,
    horizontalViewportRef,
    headerActionsRef,
    fileRefs,
    registerFileRef,
    expandedIds,
    uploadingTasksCount,
    isHorizontalIconMode,
    isEffectiveCompact,
    isHeaderCompact,
    handleFileSelect,
    handleDelete,
    collapseFile,
  };
}
