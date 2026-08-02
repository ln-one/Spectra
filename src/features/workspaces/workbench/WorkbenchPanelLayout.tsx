"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import {
  Group,
  Panel,
  type PanelImperativeHandle,
  type PanelSize,
  Separator,
} from "react-resizable-panels";
import {
  type SourcePanelFocusRequest,
  SourcePanelLayoutProvider,
} from "./SourcePanelLayoutContext";

const defaultLayout = {
  studio: 24.1239491959,
  chat: 53.8585069444,
  sources: 22.0175438597,
};

const resizeTargetMinimumSize = 24;
const panelCollapsedSize = 56;

type StudioPanelControls = {
  collapse: () => void;
  collapsed: boolean;
  expand: () => void;
  historyFocusRequest: number;
  showHistory: () => void;
};

export function studioRailPreferenceKey(workspaceId: string) {
  return `spectra:workspace:${workspaceId}:studio-panel`;
}

export function sourceRailPreferenceKey(workspaceId: string) {
  return `spectra:workspace:${workspaceId}:sources-panel`;
}

function readPanelPreference(key: string) {
  try {
    return window.localStorage.getItem(key) === "collapsed";
  } catch {
    return false;
  }
}

function writePanelPreference(key: string, collapsed: boolean) {
  try {
    window.localStorage.setItem(key, collapsed ? "collapsed" : "expanded");
  } catch {
    // The layout still works when browser storage is unavailable.
  }
}

function useCollapsiblePanelPreference(preferenceKey: string, persist: boolean) {
  const panelRef = useRef<PanelImperativeHandle | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useLayoutEffect(() => {
    if (!persist) return;
    setCollapsed(readPanelPreference(preferenceKey));
  }, [persist, preferenceKey]);

  useLayoutEffect(() => {
    if (collapsed) {
      panelRef.current?.collapse();
    } else {
      panelRef.current?.expand();
    }
  }, [collapsed]);

  function setPreference(nextCollapsed: boolean) {
    setCollapsed(nextCollapsed);
    if (persist) writePanelPreference(preferenceKey, nextCollapsed);
  }

  function handleResize(
    size: PanelSize,
    _id: string | number | undefined,
    previousSize: PanelSize | undefined,
  ) {
    if (!previousSize) return;
    const nextCollapsed = size.inPixels <= panelCollapsedSize + 1;
    if (nextCollapsed !== collapsed) setPreference(nextCollapsed);
  }

  return { collapsed, handleResize, panelRef, setPreference };
}

interface WorkbenchPanelLayoutProps {
  chat: ReactNode;
  disclaimer: string;
  disabled?: boolean;
  persistPanelState?: boolean;
  sources: ReactNode;
  studio: (controls: StudioPanelControls) => ReactNode;
  workspaceId: string;
}

export function WorkbenchPanelLayout({
  chat,
  disclaimer,
  disabled = false,
  persistPanelState = true,
  sources,
  studio,
  workspaceId,
}: WorkbenchPanelLayoutProps) {
  const t = useTranslations("Workbench");
  const studioPanel = useCollapsiblePanelPreference(
    studioRailPreferenceKey(workspaceId),
    persistPanelState,
  );
  const sourcePanel = useCollapsiblePanelPreference(
    sourceRailPreferenceKey(workspaceId),
    persistPanelState,
  );
  const [historyFocusRequest, setHistoryFocusRequest] = useState(0);
  const [sourceFocusRequest, setSourceFocusRequest] = useState<SourcePanelFocusRequest | null>(
    null,
  );

  const studioControls: StudioPanelControls = {
    collapse: () => studioPanel.setPreference(true),
    collapsed: studioPanel.collapsed,
    expand: () => studioPanel.setPreference(false),
    historyFocusRequest,
    showHistory: () => {
      studioPanel.setPreference(false);
      setHistoryFocusRequest((current) => current + 1);
    },
  };
  const sourceControls = {
    collapse: () => sourcePanel.setPreference(true),
    collapsed: sourcePanel.collapsed,
    expand: () => sourcePanel.setPreference(false),
    focusRequest: sourceFocusRequest,
    showSource: (sourceId: string) => {
      sourcePanel.setPreference(false);
      setSourceFocusRequest((current) => ({
        id: sourceId,
        sequence: (current?.sequence ?? 0) + 1,
      }));
    },
  };

  return (
    <Group
      className="h-full px-6 pb-6"
      defaultLayout={defaultLayout}
      disabled={disabled}
      id="workbench-panels"
      orientation="horizontal"
      resizeTargetMinimumSize={{
        coarse: resizeTargetMinimumSize,
        fine: resizeTargetMinimumSize,
      }}
    >
      <Panel
        className="h-full min-w-0"
        collapsedSize={`${panelCollapsedSize}px`}
        collapsible
        groupResizeBehavior="preserve-pixel-size"
        id="studio"
        maxSize="40%"
        minSize="260px"
        onResize={studioPanel.handleResize}
        panelRef={studioPanel.panelRef}
        style={{ overflow: "visible" }}
      >
        <div className="workspace-view-transition-primary h-full">{studio(studioControls)}</div>
      </Panel>
      <Separator
        aria-label={t("resizeStudioChat")}
        className="relative z-10 w-3 shrink-0 cursor-col-resize touch-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
        data-target-minimum-size={resizeTargetMinimumSize}
        data-testid="studio-chat-resizer"
        disableDoubleClick
        id="studio-chat-resizer"
      />
      <Panel
        className="h-full min-w-0"
        id="chat"
        minSize="420px"
        // The outer disclaimer uses the layout's reserved bottom gutter.
        style={{ overflow: "visible" }}
      >
        <div className="workspace-view-transition-assistant relative h-full">
          {chat}
          <p
            className="pointer-events-none absolute inset-x-0 top-full flex h-6 items-center justify-center px-2 text-center text-[10px] leading-3 text-[var(--workspace-text-muted)]"
            data-testid="workbench-disclaimer"
          >
            {disclaimer}
          </p>
        </div>
      </Panel>
      <Separator
        aria-label={t("resizeChatSources")}
        className="relative z-10 w-3 shrink-0 cursor-col-resize touch-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
        data-target-minimum-size={resizeTargetMinimumSize}
        data-testid="chat-sources-resizer"
        disableDoubleClick
        id="chat-sources-resizer"
      />
      <Panel
        className="h-full min-w-0"
        collapsedSize={`${panelCollapsedSize}px`}
        collapsible
        groupResizeBehavior="preserve-pixel-size"
        id="sources"
        minSize="214px"
        onResize={sourcePanel.handleResize}
        panelRef={sourcePanel.panelRef}
        style={{ overflow: "visible" }}
      >
        <div className="workspace-view-transition-sources h-full">
          <SourcePanelLayoutProvider value={sourceControls}>{sources}</SourcePanelLayoutProvider>
        </div>
      </Panel>
    </Group>
  );
}
