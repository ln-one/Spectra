"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { GraphViewData } from "@/features/graph-view";
import { GraphViewEngine } from "@/features/graph-view";
import type { PixiGraphViewCanvasHandle } from "@/features/graph-view/PixiGraphViewCanvas";
import { PixiGraphViewCanvas } from "@/features/graph-view/PixiGraphViewCanvas";
import { sourceFilePresentation } from "@/features/sources/ui/source-file-presentation";
import { SOURCE_ICON_PALETTE } from "@/features/sources/ui/source-icon-palette";
import { PUBLIC_PREVIEW_SOURCE_SPECS } from "@/features/workspaces/workbench/PublicWorkbenchPreview";
import {
  STUDIO_TOOL_IDS,
  STUDIO_TOOL_PRESENTATIONS,
} from "@/features/workspaces/workbench/studioTools";
import { TOOL_RAY_COLORS } from "./portalSpectrum";

export type PortalKnowledgeGraphHandle = {
  /** 0 hidden · 1 hub · 2 +sources & incoming links · 3 +artifacts & outgoing · 4 +cross references · 5 +peer course projects */
  setStage: (stage: number) => void;
};

type PortalGraphNodeData = {
  label: string;
  color: string;
  /** Course knowledge bases get the renderer's double-ring root halo. */
  root?: boolean;
};

const HUB_ID = "portal-knowledge-context";

// Real creation titles, mirroring the preview's artifact history.
const PORTAL_ARTIFACT_TITLES: Record<(typeof STUDIO_TOOL_IDS)[number], string> = {
  "smart-slides": "新的知识表达",
  "teaching-document": "知识脉络讲义",
  "mind-map": "概念关系图",
  quiz: "理解检验",
  "interactive-game": "知识闯关游戏",
  animation: "概念演示动画",
};

// Other course projects the hub references / is referenced by — the same
// project-level structure the real knowledge network is built from.
const PORTAL_PEER_PROJECTS = [
  {
    id: "portal-project-data-structures",
    label: "数据结构",
    color: "#0ea5e9",
    files: ["数据结构讲义.pdf", "数据结构习题.docx"],
  },
  {
    id: "portal-project-machine-learning",
    label: "机器学习",
    color: "#f43f5e",
    files: ["机器学习课件.pptx", "实验数据.xlsx"],
  },
  {
    id: "portal-project-operating-systems",
    label: "操作系统",
    color: "#14b8a6",
    files: ["操作系统讲义.pdf", "进程实验.docx"],
  },
] as const;

// Fixed world coordinates for every node. The finale is a scrubbed animation,
// so the layout is deterministic — nodes are pinned (fx/fy) and links grow by
// dragging each new node from the hub to its slot, never by live physics.
type PortalGraphLayout = Record<string, { x: number; y: number }>;

const PEER_PROJECT_POSITIONS = [
  { x: -620, y: -300 },
  { x: 560, y: -400 },
  { x: 100, y: 560 },
] as const;

// Obsidian-style network for the portal finale: the workbench folds into the
// central project node, then incoming links (sources), outgoing links
// (creations) and cross-references grow out of it stage by stage.
export function PortalKnowledgeGraph({
  graphRef,
}: {
  graphRef: React.RefObject<PortalKnowledgeGraphHandle | null>;
}) {
  const t = useTranslations("Workbench");
  const marketing = useTranslations("Marketing");
  const handleRef = useRef<PixiGraphViewCanvasHandle | null>(null);
  const lastFitAtRef = useRef(0);
  const engineRef = useRef<GraphViewEngine<PortalGraphNodeData> | null>(null);
  const stageRef = useRef(0);
  const growthAnimationRef = useRef<number | null>(null);
  const [engine, setEngine] = useState<GraphViewEngine<PortalGraphNodeData> | null>(null);

  const { stages, layout } = useMemo<{
    stages: readonly GraphViewData<PortalGraphNodeData>[];
    layout: PortalGraphLayout;
  }>(() => {
    // The renderer derives visual size from `weight` (clamped 8–30), not from
    // the collision `radius`. Four explicit tiers separate the node kinds at a
    // glance: hub (30) > course knowledge bases (22) > creations (14) > files (8).
    const sourceNodes = PUBLIC_PREVIEW_SOURCE_SPECS.map(([name, fileName], index) => {
      const presentation = sourceFilePresentation(fileName);
      const extension = fileName.split(".").at(-1) ?? "";
      return {
        id: `portal-source-${index}`,
        weight: 0,
        radius: 8,
        data: {
          label: extension ? `${name}.${extension}` : name,
          color: SOURCE_ICON_PALETTE[presentation.iconTone].light.foreground,
        },
      };
    });
    const artifactNodes = STUDIO_TOOL_IDS.map((id) => {
      const presentation = STUDIO_TOOL_PRESENTATIONS[id];
      return {
        id: `portal-artifact-${id}`,
        weight: 21,
        radius: 14,
        data: {
          label: PORTAL_ARTIFACT_TITLES[id] ?? t(presentation.labelKey),
          color: TOOL_RAY_COLORS[presentation.tone],
        },
      };
    });
    // The workbench itself folds into this node — pinned to the world origin so
    // it lands exactly where the shrinking shell disappears.
    const hubNode = {
      id: HUB_ID,
      weight: 99,
      radius: 30,
      x: 0,
      y: 0,
      data: { label: marketing("portalGraphHubLabel"), color: "#8b5cf6", root: true },
    };
    const peerProjectNodes = PORTAL_PEER_PROJECTS.map((project) => ({
      id: project.id,
      weight: 53,
      radius: 22,
      data: { label: project.label, color: project.color, root: true },
    }));
    const peerFileNodes = PORTAL_PEER_PROJECTS.flatMap((project) =>
      project.files.map((fileName, fileIndex) => {
        const presentation = sourceFilePresentation(fileName);
        return {
          id: `${project.id}-file-${fileIndex}`,
          weight: 0,
          radius: 8,
          data: {
            label: fileName,
            color: SOURCE_ICON_PALETTE[presentation.iconTone].light.foreground,
          },
        };
      }),
    );

    const incomingLinks = sourceNodes.map((node) => ({ source: node.id, target: HUB_ID }));
    const outgoingLinks = artifactNodes.map((node) => ({ source: HUB_ID, target: node.id }));
    // Cross-references: every creation cites the sources it grew from.
    const crossLinks = artifactNodes.flatMap((node, index) => [
      { source: node.id, target: `portal-source-${(index + 2) % sourceNodes.length}` },
      { source: node.id, target: `portal-source-${(index * 3 + 5) % sourceNodes.length}` },
    ]);
    // Project-level structure: the hub course references 数据结构, and is itself
    // referenced by 机器学习; 操作系统 in turn references 数据结构. Each peer
    // project aggregates its own files.
    const projectLinks = [
      { source: HUB_ID, target: "portal-project-data-structures" },
      { source: "portal-project-machine-learning", target: HUB_ID },
      { source: "portal-project-operating-systems", target: "portal-project-data-structures" },
      ...peerFileNodes.map((node) => ({
        source: node.id,
        target: node.id.slice(0, node.id.lastIndexOf("-file-")),
      })),
    ];

    const layout: PortalGraphLayout = { [HUB_ID]: { x: 0, y: 0 } };
    const toPoint = (angleDeg: number, radius: number) => ({
      x: Math.cos((angleDeg * Math.PI) / 180) * radius,
      y: Math.sin((angleDeg * Math.PI) / 180) * radius,
    });
    // Sources arc along the left, creations along the right — matching the
    // workbench's 资料来源 → 课程知识库 flow direction.
    sourceNodes.forEach((node, index) => {
      layout[node.id] = toPoint(110 + (140 * index) / (sourceNodes.length - 1), 430);
    });
    artifactNodes.forEach((node, index) => {
      layout[node.id] = toPoint(-55 + (110 * index) / (artifactNodes.length - 1), 470);
    });
    PORTAL_PEER_PROJECTS.forEach((project, projectIndex) => {
      const position = PEER_PROJECT_POSITIONS[projectIndex] ?? { x: 0, y: 0 };
      layout[project.id] = position;
      project.files.forEach((_, fileIndex) => {
        layout[`${project.id}-file-${fileIndex}`] = {
          x: position.x + (fileIndex === 0 ? -115 : 115),
          y: position.y + (fileIndex === 0 ? 95 : -90),
        };
      });
    });

    return {
      stages: [
        { nodes: [], links: [] },
        { nodes: [hubNode], links: [] },
        { nodes: [hubNode, ...sourceNodes], links: incomingLinks },
        {
          nodes: [hubNode, ...sourceNodes, ...artifactNodes],
          links: [...incomingLinks, ...outgoingLinks],
        },
        {
          nodes: [hubNode, ...sourceNodes, ...artifactNodes],
          links: [...incomingLinks, ...outgoingLinks, ...crossLinks],
        },
        {
          nodes: [hubNode, ...sourceNodes, ...artifactNodes, ...peerProjectNodes, ...peerFileNodes],
          links: [...incomingLinks, ...outgoingLinks, ...crossLinks, ...projectLinks],
        },
      ],
      layout,
    };
  }, [t, marketing]);

  useEffect(() => {
    const nextEngine = new GraphViewEngine<PortalGraphNodeData>({
      onUpdate: () => {
        handleRef.current?.invalidate();
        // From the moment the network starts branching out, re-frame it on
        // every physics tick (throttled). The camera visibly pulls back as the
        // graph grows, and the final frame is guaranteed to contain all nodes —
        // no dependence on settle events firing in the right order.
        if (stageRef.current >= 2) {
          const now = performance.now();
          if (now - lastFitAtRef.current > 380) {
            lastFitAtRef.current = now;
            handleRef.current?.fitGraph(420);
          }
        }
      },
      onSettled: () => {
        if (stageRef.current >= 2 && nextEngine.getGraphData().nodes.length > 0) {
          handleRef.current?.fitGraph(650);
        }
      },
    });
    engineRef.current = nextEngine;
    setEngine(nextEngine);
    nextEngine.setData(stages[0] ?? { nodes: [], links: [] });
    return () => {
      nextEngine.dispose();
      engineRef.current = null;
      setEngine((current) => (current === nextEngine ? null : current));
    };
  }, [stages]);

  const setStage = useCallback(
    (stage: number) => {
      const clamped = Math.max(0, Math.min(stage, stages.length - 1));
      const currentEngine = engineRef.current;
      if (clamped === stageRef.current || !currentEngine) return;
      const previousIds = new Set((stages[stageRef.current]?.nodes ?? []).map((node) => node.id));
      stageRef.current = clamped;
      const nextData = stages[clamped] ?? { nodes: [], links: [] };

      if (growthAnimationRef.current !== null) {
        cancelAnimationFrame(growthAnimationRef.current);
        growthAnimationRef.current = null;
      }

      // Every node has a fixed slot in `layout`. New nodes spawn on top of the
      // hub and are then dragged frame by frame to their slot, so the link line
      // visibly grows out of the hub instead of nodes popping into place.
      const origin = layout[HUB_ID] ?? { x: 0, y: 0 };
      const data: GraphViewData<PortalGraphNodeData> = {
        nodes: nextData.nodes.map((node) =>
          previousIds.has(node.id) ? node : { ...node, x: origin.x, y: origin.y },
        ),
        links: nextData.links,
      };
      currentEngine.setData(data);

      // Pin existing nodes to their slots (no-op visually when already there).
      const newNodes: (typeof nextData.nodes)[number][] = [];
      for (const node of nextData.nodes) {
        const target = layout[node.id];
        if (!target) continue;
        if (previousIds.has(node.id)) currentEngine.dragNode(node.id, target.x, target.y);
        else newNodes.push(node);
      }
      if (newNodes.length === 0) return;

      // Peer files trail behind their project node so the project arrives
      // before it sprouts its own attachments (sorted order = stagger order).
      const isPeerFile = (id: string) => id.includes("-file-");
      const sortedNew = [...newNodes].sort(
        (a, b) => Number(isPeerFile(a.id)) - Number(isPeerFile(b.id)),
      );
      const STAGGER_MS = 90;
      const DURATION_MS = 900;
      const start = performance.now();
      const tick = (now: number) => {
        let allDone = true;
        sortedNew.forEach((node, index) => {
          const target = layout[node.id];
          if (!target) return;
          const progress = Math.min(
            1,
            Math.max(0, (now - start - index * STAGGER_MS) / DURATION_MS),
          );
          const eased = 1 - (1 - progress) ** 3;
          currentEngine.dragNode(
            node.id,
            origin.x + (target.x - origin.x) * eased,
            origin.y + (target.y - origin.y) * eased,
          );
          if (progress < 1) allDone = false;
        });
        growthAnimationRef.current = allDone ? null : requestAnimationFrame(tick);
      };
      growthAnimationRef.current = requestAnimationFrame(tick);
    },
    [stages, layout],
  );

  useEffect(
    () => () => {
      if (growthAnimationRef.current !== null) cancelAnimationFrame(growthAnimationRef.current);
    },
    [],
  );

  useImperativeHandle(graphRef, () => ({ setStage }), [setStage]);

  return (
    <div className="pointer-events-none relative h-full w-full">
      <PixiGraphViewCanvas
        engine={engine}
        selectedId={null}
        onSelect={() => undefined}
        onHover={() => undefined}
        onReady={(handle) => {
          handleRef.current = handle;
        }}
        nodeSizeMultiplier={1}
        lineSizeMultiplier={1}
        textFadeMultiplier={0}
        showArrow
      />
    </div>
  );
}
