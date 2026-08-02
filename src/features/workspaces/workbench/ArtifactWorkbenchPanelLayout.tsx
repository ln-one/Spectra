"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import {
  Group,
  type GroupImperativeHandle,
  Panel,
  type PanelImperativeHandle,
  Separator,
} from "react-resizable-panels";
import type { ArtifactWorkbenchLayoutMode } from "./artifactWorkbench";

const ARTIFACT_LAYOUTS = {
  compose: { artifact: 55, side: 45 },
  preview: { artifact: 68, side: 32 },
} satisfies Record<ArtifactWorkbenchLayoutMode, Record<"artifact" | "side", number>>;

// Panel border + header + body padding, followed by 55px cards with an 8px gap.
const SOURCE_PANEL_CHROME_HEIGHT = 61;
const SOURCE_CARD_ROW_HEIGHT = 63;
const SOURCE_PANEL_MINIMUM_ROWS = 2;
const SOURCE_PANEL_ROWS = {
  compose: 4,
  preview: 2,
} satisfies Record<ArtifactWorkbenchLayoutMode, number>;

export function sourcePanelHeightForRows(rows: number) {
  return SOURCE_PANEL_CHROME_HEIGHT + SOURCE_CARD_ROW_HEIGHT * rows;
}

export function nearestSourcePanelHeight(height: number) {
  const rows = Math.max(
    SOURCE_PANEL_MINIMUM_ROWS,
    Math.round((height - SOURCE_PANEL_CHROME_HEIGHT) / SOURCE_CARD_ROW_HEIGHT),
  );
  return sourcePanelHeightForRows(rows);
}

export function ArtifactWorkbenchPanelLayout({
  artifact,
  assistant,
  disclaimer,
  layoutMode,
  sources,
}: {
  artifact: ReactNode;
  assistant: ReactNode;
  disclaimer: string;
  layoutMode: ArtifactWorkbenchLayoutMode;
  sources: ReactNode;
}) {
  const t = useTranslations("Workbench");
  const outerGroupRef = useRef<GroupImperativeHandle | null>(null);
  const sourcesPanelRef = useRef<PanelImperativeHandle | null>(null);
  const initialLayoutModeRef = useRef(layoutMode);
  const initialSourcesHeight = sourcePanelHeightForRows(
    SOURCE_PANEL_ROWS[initialLayoutModeRef.current],
  );

  useLayoutEffect(() => {
    outerGroupRef.current?.setLayout(ARTIFACT_LAYOUTS[layoutMode]);
    sourcesPanelRef.current?.resize(`${sourcePanelHeightForRows(SOURCE_PANEL_ROWS[layoutMode])}px`);
  }, [layoutMode]);

  return (
    <Group
      className="h-full px-6 pb-6"
      defaultLayout={ARTIFACT_LAYOUTS[initialLayoutModeRef.current]}
      groupRef={outerGroupRef}
      id="artifact-workbench-panels"
      orientation="horizontal"
    >
      <Panel id="artifact" minSize="520px" className="h-full min-w-0">
        <div className="workspace-view-transition-primary h-full">{artifact}</div>
      </Panel>
      <Separator
        aria-label={t("resizeArtifactAssistant")}
        className="relative z-10 w-3 shrink-0 cursor-col-resize touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
      />
      <Panel id="side" minSize="300px" maxSize="46%" className="h-full min-w-0">
        <Group
          id="artifact-side-panels"
          onLayoutChanged={(_layout, meta) => {
            if (!meta.isUserInteraction) return;
            const currentHeight = sourcesPanelRef.current?.getSize().inPixels;
            if (currentHeight === undefined) return;
            sourcesPanelRef.current?.resize(`${nearestSourcePanelHeight(currentHeight)}px`);
          }}
          orientation="vertical"
        >
          <Panel id="assistant" minSize="260px" className="min-h-0">
            <div className="workspace-view-transition-assistant relative h-full">
              {assistant}
              <p className="pointer-events-none absolute inset-x-0 top-full z-10 flex h-3 items-center justify-center px-2 text-center text-[9px] leading-none text-[var(--workspace-text-muted)]">
                {disclaimer}
              </p>
            </div>
          </Panel>
          <Separator
            aria-label={t("resizeAssistantSources")}
            className="relative z-20 h-3 shrink-0 cursor-row-resize touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
          />
          <Panel
            className="min-h-0"
            defaultSize={`${initialSourcesHeight}px`}
            groupResizeBehavior="preserve-pixel-size"
            id="sources"
            minSize={`${sourcePanelHeightForRows(SOURCE_PANEL_MINIMUM_ROWS)}px`}
            panelRef={sourcesPanelRef}
          >
            <div className="workspace-view-transition-sources h-full">{sources}</div>
          </Panel>
        </Group>
      </Panel>
    </Group>
  );
}
