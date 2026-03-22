import { useCallback, useEffect, useRef, useState } from "react";
import { type GenerationHistory } from "@/stores/projectStore";
import {
  COLLAPSED_EXPANDED_SOURCES_HEIGHT_PX,
  COLLAPSED_SOURCES_TRIGGER_WIDTH_PX,
  COLLAPSED_SOURCES_WIDTH_PX,
  EXPANDED_SOURCES_COMFORT_WIDTH_PX,
  HEADER_TO_PANEL_GAP,
  MIN_EXPANDED_RIGHT_PANEL_WIDTH,
  MIN_RESIZABLE_PANEL_WIDTH,
  PAGE_GAP,
  PANEL_GAP,
  SOURCES_TITLE_SAFE_MIN_WIDTH_PX,
} from "./constants";

export function resolvePreferredSessionId(
  querySessionId: string | null,
  generationHistory: GenerationHistory[],
  activeSessionId: string | null
): string | null {
  if (querySessionId && generationHistory.length === 0) {
    return querySessionId;
  }
  if (activeSessionId && generationHistory.length === 0) {
    return activeSessionId;
  }

  const allSessionIds = Array.from(
    new Set(generationHistory.map((item) => item.id))
  );
  if (querySessionId) {
    if (allSessionIds.includes(querySessionId)) {
      return querySessionId;
    }
    return activeSessionId && allSessionIds.includes(activeSessionId)
      ? activeSessionId
      : generationHistory.length > 0
        ? generationHistory[0].id
        : querySessionId;
  }
  if (activeSessionId && allSessionIds.includes(activeSessionId)) {
    return activeSessionId;
  }
  if (activeSessionId && generationHistory.length === 0) {
    return activeSessionId;
  }
  return generationHistory.length > 0 ? generationHistory[0].id : null;
}

export function dedupeGenerationHistory(
  generationHistory: GenerationHistory[]
): GenerationHistory[] {
  const seen = new Set<string>();
  return generationHistory.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

export function useProjectPanelLayout({
  layoutMode,
  isLoading,
}: {
  layoutMode: string;
  isLoading: boolean;
}) {
  const [studioWidth, setStudioWidth] = useState(25);
  const [chatWidth, setChatWidth] = useState(52);
  const [expandedStudioWidth, setExpandedStudioWidth] = useState(70);
  const [expandedChatHeight, setExpandedChatHeight] = useState(50);
  const [panelAreaWidth, setPanelAreaWidth] = useState(0);
  const [panelAreaHeight, setPanelAreaHeight] = useState(0);

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const panelAreaRef = useRef<HTMLDivElement | null>(null);
  const previousChatWidthRef = useRef<number | null>(null);
  const previousExpandedChatHeightRef = useRef<number | null>(null);
  const startSizesRef = useRef({
    studio: 0,
    chat: 0,
    expandedStudio: 0,
    expandedChatHeight: 0,
  });

  const isExpanded = layoutMode === "expanded";

  useEffect(() => {
    if (isLoading) return;
    const target = panelAreaRef.current;
    if (!target) return;

    const syncSize = () => {
      setPanelAreaWidth(target.clientWidth);
      setPanelAreaHeight(target.clientHeight);
    };
    syncSize();

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(syncSize)
        : null;
    observer?.observe(target);
    window.addEventListener("resize", syncSize);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncSize);
    };
  }, [isLoading]);

  const sourcesWidthPercent = 100 - studioWidth - chatWidth;
  const effectivePanelAreaWidth =
    panelAreaWidth > 0
      ? panelAreaWidth
      : typeof window !== "undefined"
        ? window.innerWidth - PAGE_GAP * 2
        : 0;
  const sourcesWidthPx =
    effectivePanelAreaWidth > 0
      ? (effectivePanelAreaWidth * sourcesWidthPercent) / 100 -
        (PAGE_GAP + PANEL_GAP / 2)
      : 0;
  const isSourcesCollapsedByWidth =
    !isExpanded &&
    sourcesWidthPx > 0 &&
    sourcesWidthPx <= COLLAPSED_SOURCES_TRIGGER_WIDTH_PX;
  const effectivePanelAreaHeight =
    panelAreaHeight > 0
      ? panelAreaHeight
      : typeof window !== "undefined"
        ? window.innerHeight - (HEADER_TO_PANEL_GAP + PAGE_GAP)
        : 0;
  const expandedSourcesHeightPx =
    effectivePanelAreaHeight > 0
      ? (effectivePanelAreaHeight * (100 - expandedChatHeight)) / 100 -
        (PAGE_GAP + PANEL_GAP / 2)
      : 0;
  const isExpandedSourcesCollapsedByHeight =
    isExpanded &&
    expandedSourcesHeightPx > 0 &&
    expandedSourcesHeightPx <= COLLAPSED_EXPANDED_SOURCES_HEIGHT_PX + 2;

  const toggleSourcesCollapsed = useCallback(
    (action: "collapse" | "expand" | "toggle" = "toggle") => {
      if (isExpanded) return;

      const containerWidth =
        panelAreaRef.current?.clientWidth ?? window.innerWidth - PAGE_GAP * 2;
      const minSourcesPercent =
        ((MIN_RESIZABLE_PANEL_WIDTH + PAGE_GAP + PANEL_GAP / 2) /
          containerWidth) *
        100;
      const maxChatBySources = Math.min(
        75,
        100 - studioWidth - minSourcesPercent
      );

      const applyTargetSourcesWidth = (targetWidthPx: number) => {
        const targetSourcesPercent = Math.max(
          minSourcesPercent,
          ((targetWidthPx + PAGE_GAP + PANEL_GAP / 2) / containerWidth) * 100
        );
        const targetChat = 100 - studioWidth - targetSourcesPercent;
        const nextChat = Math.max(30, Math.min(maxChatBySources, targetChat));
        setChatWidth(nextChat);
      };

      const shouldExpand =
        action === "expand" ||
        (action === "toggle" && isSourcesCollapsedByWidth);

      if (shouldExpand) {
        if (previousChatWidthRef.current !== null) {
          const restoredChat = Math.max(
            30,
            Math.min(maxChatBySources, previousChatWidthRef.current)
          );
          setChatWidth(restoredChat);
          return;
        }
        applyTargetSourcesWidth(EXPANDED_SOURCES_COMFORT_WIDTH_PX);
        return;
      }

      previousChatWidthRef.current = chatWidth;
      applyTargetSourcesWidth(COLLAPSED_SOURCES_WIDTH_PX);
    },
    [chatWidth, isExpanded, isSourcesCollapsedByWidth, studioWidth]
  );

  const handleToggleExpandedSources = useCallback(() => {
    if (!isExpanded) return;

    const containerHeight =
      panelAreaRef.current?.clientHeight ??
      window.innerHeight - (HEADER_TO_PANEL_GAP + PAGE_GAP);
    const maxChatByCollapsedSources =
      100 -
      ((COLLAPSED_EXPANDED_SOURCES_HEIGHT_PX + PAGE_GAP + PANEL_GAP / 2) /
        containerHeight) *
        100;

    if (!isExpandedSourcesCollapsedByHeight) {
      previousExpandedChatHeightRef.current = expandedChatHeight;
      setExpandedChatHeight(
        Math.max(30, Math.min(92, maxChatByCollapsedSources))
      );
      return;
    }

    setExpandedChatHeight(previousExpandedChatHeightRef.current ?? 50);
  }, [expandedChatHeight, isExpanded, isExpandedSourcesCollapsedByHeight]);

  const handleMouseDown = useCallback(
    (
      event: React.MouseEvent,
      handle:
        | "studio-chat"
        | "chat-sources"
        | "expanded-studio-right"
        | "expanded-chat-sources"
    ) => {
      event.preventDefault();
      isDraggingRef.current = true;
      startXRef.current = event.clientX;
      startYRef.current = event.clientY;
      startSizesRef.current = {
        studio: studioWidth,
        chat: chatWidth,
        expandedStudio: expandedStudioWidth,
        expandedChatHeight: expandedChatHeight,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDraggingRef.current) return;

        const deltaX = moveEvent.clientX - startXRef.current;
        const deltaY = moveEvent.clientY - startYRef.current;
        const containerWidth =
          panelAreaRef.current?.clientWidth ?? window.innerWidth - PAGE_GAP * 2;
        const containerHeight =
          panelAreaRef.current?.clientHeight ??
          window.innerHeight - (HEADER_TO_PANEL_GAP + PAGE_GAP);
        const deltaPercent = (deltaX / containerWidth) * 100;
        const deltaYPercent = (deltaY / containerHeight) * 100;

        if (handle === "studio-chat") {
          const nextStudio = Math.max(
            15,
            Math.min(40, startSizesRef.current.studio + deltaPercent)
          );
          const nextChat = Math.max(
            30,
            Math.min(60, startSizesRef.current.chat - deltaPercent)
          );
          setStudioWidth(nextStudio);
          setChatWidth(nextChat);
          return;
        }

        if (handle === "chat-sources") {
          const minSourcesPercent =
            ((MIN_RESIZABLE_PANEL_WIDTH + PAGE_GAP + PANEL_GAP / 2) /
              containerWidth) *
            100;
          const maxChatBySources = Math.min(
            75,
            100 - startSizesRef.current.studio - minSourcesPercent
          );
          let nextChat = Math.max(
            30,
            Math.min(
              Math.max(30, maxChatBySources),
              startSizesRef.current.chat + deltaPercent
            )
          );

          const toChatBySourcesWidthPx = (targetWidthPx: number) => {
            const targetSourcesPercent =
              ((targetWidthPx + PAGE_GAP + PANEL_GAP / 2) / containerWidth) *
              100;
            const targetChat =
              100 - startSizesRef.current.studio - targetSourcesPercent;
            return Math.max(
              30,
              Math.min(Math.max(30, maxChatBySources), targetChat)
            );
          };

          const startSourcesPercent =
            100 - startSizesRef.current.studio - startSizesRef.current.chat;
          const startSourcesWidthPx =
            (containerWidth * startSourcesPercent) / 100 -
            (PAGE_GAP + PANEL_GAP / 2);
          const startedCollapsed =
            startSourcesWidthPx <= COLLAPSED_SOURCES_TRIGGER_WIDTH_PX + 2;

          const nextSourcesPercent =
            100 - startSizesRef.current.studio - nextChat;
          const nextSourcesWidthPx =
            (containerWidth * nextSourcesPercent) / 100 -
            (PAGE_GAP + PANEL_GAP / 2);

          const collapseSnapThreshold = COLLAPSED_SOURCES_TRIGGER_WIDTH_PX + 4;
          const expandSnapThreshold = COLLAPSED_SOURCES_TRIGGER_WIDTH_PX - 60;

          if (deltaX > 0 && nextSourcesWidthPx <= collapseSnapThreshold) {
            nextChat = toChatBySourcesWidthPx(COLLAPSED_SOURCES_WIDTH_PX);
          } else if (
            deltaX < 0 &&
            startedCollapsed &&
            nextSourcesWidthPx >= expandSnapThreshold
          ) {
            nextChat = toChatBySourcesWidthPx(SOURCES_TITLE_SAFE_MIN_WIDTH_PX);
          }

          setChatWidth(nextChat);
          return;
        }

        if (handle === "expanded-studio-right") {
          const maxExpandedStudioByWidth =
            100 -
            ((MIN_EXPANDED_RIGHT_PANEL_WIDTH + PAGE_GAP + PANEL_GAP / 2) /
              containerWidth) *
              100;
          const nextExpandedStudio = Math.max(
            45,
            Math.min(
              Math.max(45, Math.min(92, maxExpandedStudioByWidth)),
              startSizesRef.current.expandedStudio + deltaPercent
            )
          );
          setExpandedStudioWidth(nextExpandedStudio);
          return;
        }

        const maxExpandedChatHeight =
          100 -
          ((COLLAPSED_EXPANDED_SOURCES_HEIGHT_PX + PAGE_GAP + PANEL_GAP / 2) /
            containerHeight) *
            100;
        const nextExpandedChatHeight = Math.max(
          30,
          Math.min(
            Math.min(92, maxExpandedChatHeight),
            startSizesRef.current.expandedChatHeight + deltaYPercent
          )
        );
        setExpandedChatHeight(nextExpandedChatHeight);
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [studioWidth, chatWidth, expandedStudioWidth, expandedChatHeight]
  );

  return {
    isExpanded,
    panelAreaRef,
    studioWidth,
    chatWidth,
    expandedStudioWidth,
    expandedChatHeight,
    handleMouseDown,
    sourcesWidthPercent,
    isSourcesCollapsedByWidth,
    toggleSourcesCollapsed,
    isExpandedSourcesCollapsedByHeight,
    handleToggleExpandedSources,
  };
}
