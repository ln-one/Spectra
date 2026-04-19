"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { HtmlPreviewFrame, type HtmlPreviewFrameLayout } from "./HtmlPreviewFrame";
import type { AuthorityPreviewSlide } from "../useGeneratePreviewState";

export type AuthorityEditableNode = {
  node_id: string;
  kind: "text" | "image";
  text?: string;
  src?: string;
  alt?: string;
  bbox: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  style: Record<string, string>;
  edit_capabilities: Array<"update_text" | "replace_image">;
};

export type AuthorityEditableScene = {
  slide_id: string;
  nodes: AuthorityEditableNode[];
};

type Props = {
  slide: AuthorityPreviewSlide;
  className?: string;
  interactive?: boolean;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  onSceneChange?: (scene: AuthorityEditableScene) => void;
};

function getDomPath(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && current.tagName.toLowerCase() !== "html") {
    const tagName = current.tagName.toLowerCase();
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(
          (item) => item.tagName === current?.tagName
        )
      : [];
    const position = siblings.indexOf(current) + 1;
    segments.unshift(`${tagName}[${position}]`);
    current = current.parentElement;
  }
  return segments.join("/");
}

function isVisibleElement(element: HTMLElement): boolean {
  const frameWindow = element.ownerDocument.defaultView;
  if (!frameWindow) return false;
  const style = frameWindow.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number(style.opacity || "1") <= 0) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 4 && rect.height > 4;
}

function extractScene(
  document: Document,
  layout: HtmlPreviewFrameLayout | null,
  slideId: string
): AuthorityEditableScene {
  if (!layout) {
    return { slide_id: slideId, nodes: [] };
  }
  const root =
    document.querySelector(".spectra-page") ||
    document.querySelector(".spectra-page-preview") ||
    document.body;
  if (!root) {
    return { slide_id: slideId, nodes: [] };
  }

  const nodes: AuthorityEditableNode[] = [];
  const textCandidates = Array.from(root.querySelectorAll<HTMLElement>("*"))
    .filter((element) => {
      if (!isVisibleElement(element)) return false;
      if (["script", "style", "svg", "img"].includes(element.tagName.toLowerCase())) {
        return false;
      }
      const text = (element.innerText || "").trim();
      if (!text) return false;
      const childTextNodes = Array.from(element.children).some((child) => {
        const childText = ((child as HTMLElement).innerText || "").trim();
        return Boolean(childText);
      });
      return !childTextNodes || element.children.length === 0;
    })
    .slice(0, 60);

  textCandidates.forEach((element) => {
    const rect = element.getBoundingClientRect();
    const frameWindow = element.ownerDocument.defaultView;
    if (!frameWindow) return;
    const computed = frameWindow.getComputedStyle(element);
    nodes.push({
      node_id: `text:${getDomPath(element)}`,
      kind: "text",
      text: (element.innerText || "").trim(),
      bbox: {
        left: layout.left + rect.left * layout.scale,
        top: layout.top + rect.top * layout.scale,
        width: rect.width * layout.scale,
        height: rect.height * layout.scale,
      },
      style: {
        fontFamily: computed.fontFamily,
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        color: computed.color,
        textAlign: computed.textAlign,
      },
      edit_capabilities: ["update_text"],
    });
  });

  Array.from(root.querySelectorAll<HTMLImageElement>("img"))
    .filter((element) => isVisibleElement(element))
    .slice(0, 20)
    .forEach((element) => {
      const rect = element.getBoundingClientRect();
      nodes.push({
        node_id: `image:${getDomPath(element)}`,
        kind: "image",
        src: element.currentSrc || element.src || "",
        alt: element.alt || "",
        bbox: {
          left: layout.left + rect.left * layout.scale,
          top: layout.top + rect.top * layout.scale,
          width: rect.width * layout.scale,
          height: rect.height * layout.scale,
        },
        style: {},
        edit_capabilities: ["replace_image"],
      });
    });

  return { slide_id: slideId, nodes };
}

function createEmptyScene(slideId: string): AuthorityEditableScene {
  return { slide_id: slideId, nodes: [] };
}

function getSceneSignature(scene: AuthorityEditableScene): string {
  return JSON.stringify(scene);
}

function isSameLayout(
  current: HtmlPreviewFrameLayout | null,
  next: HtmlPreviewFrameLayout
): boolean {
  return (
    current?.scale === next.scale &&
    current.left === next.left &&
    current.top === next.top &&
    current.viewportWidth === next.viewportWidth &&
    current.viewportHeight === next.viewportHeight
  );
}

export function EditableAuthorityHtmlStage({
  slide,
  className,
  interactive = true,
  selectedNodeId,
  onSelectNode,
  onSceneChange,
}: Props) {
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const [layout, setLayout] = useState<HtmlPreviewFrameLayout | null>(null);
  const [scene, setScene] = useState<AuthorityEditableScene>(() =>
    createEmptyScene(slide.slide_id)
  );
  const sceneSignatureRef = useRef<string | null>(null);
  const onSceneChangeRef = useRef(onSceneChange);

  const activeHtml = slide.html_preview || slide.frames?.[0]?.html_preview || "";
  const viewportWidth = slide.width || slide.frames?.[0]?.width || 1280;
  const viewportHeight = slide.height || slide.frames?.[0]?.height || 720;

  useEffect(() => {
    onSceneChangeRef.current = onSceneChange;
  }, [onSceneChange]);

  useEffect(() => {
    sceneSignatureRef.current = null;
  }, [activeHtml, slide.slide_id]);

  const handleDocumentReady = useCallback((doc: Document) => {
    setFrameDocument((current) => (current === doc ? current : doc));
  }, []);

  const handleViewportLayoutChange = useCallback((nextLayout: HtmlPreviewFrameLayout) => {
    setLayout((current) => (isSameLayout(current, nextLayout) ? current : nextLayout));
  }, []);

  const publishScene = useCallback((nextScene: AuthorityEditableScene) => {
    const nextSignature = getSceneSignature(nextScene);
    if (sceneSignatureRef.current === nextSignature) return;

    sceneSignatureRef.current = nextSignature;
    setScene(nextScene);
    onSceneChangeRef.current?.(nextScene);
  }, []);

  const refreshScene = useCallback(() => {
    if (!frameDocument) return;
    const nextScene = extractScene(frameDocument, layout, slide.slide_id);
    publishScene(nextScene);
  }, [frameDocument, layout, publishScene, slide.slide_id]);

  useEffect(() => {
    if (!frameDocument) return;
    const frameWindow = frameDocument.defaultView;
    let pendingRafId: number | null = null;
    const scheduleRefresh = () => {
      if (!frameWindow) {
        refreshScene();
        return;
      }
      if (pendingRafId !== null) {
        frameWindow.cancelAnimationFrame(pendingRafId);
      }
      pendingRafId = frameWindow.requestAnimationFrame(() => {
        pendingRafId = null;
        refreshScene();
      });
    };

    scheduleRefresh();
    const observer = new MutationObserver(() => {
      scheduleRefresh();
    });
    observer.observe(frameDocument.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    return () => {
      observer.disconnect();
      if (frameWindow && pendingRafId !== null) {
        frameWindow.cancelAnimationFrame(pendingRafId);
      }
    };
  }, [frameDocument, refreshScene]);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => refreshScene());
    return () => window.cancelAnimationFrame(rafId);
  }, [layout, refreshScene]);

  const visibleScene = useMemo(
    () => (scene.slide_id === slide.slide_id ? scene : createEmptyScene(slide.slide_id)),
    [scene, slide.slide_id]
  );

  const selectedNode = useMemo(
    () => visibleScene.nodes.find((node) => node.node_id === selectedNodeId) ?? null,
    [visibleScene.nodes, selectedNodeId]
  );

  return (
    <div className={cn("relative h-full w-full", className)}>
      <HtmlPreviewFrame
        title={slide.title || `Slide ${slide.index + 1}`}
        html={activeHtml}
        className="h-full"
        interactive={interactive}
        viewportWidth={viewportWidth}
        viewportHeight={viewportHeight}
        onDocumentReady={handleDocumentReady}
        onViewportLayoutChange={handleViewportLayoutChange}
      />
      <div className="pointer-events-none absolute inset-0">
        {visibleScene.nodes.map((node) => {
          const isSelected = selectedNode?.node_id === node.node_id;
          return (
            <button
              key={node.node_id}
              type="button"
              onClick={() => onSelectNode?.(node.node_id)}
              className={cn(
                "pointer-events-auto absolute rounded border transition",
                isSelected
                  ? "border-emerald-500 bg-emerald-400/10 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
                  : "border-blue-400/40 bg-blue-300/5 hover:border-blue-500/80"
              )}
              style={{
                left: `${node.bbox.left}px`,
                top: `${node.bbox.top}px`,
                width: `${node.bbox.width}px`,
                height: `${node.bbox.height}px`,
              }}
              title={node.kind === "text" ? node.text || "text" : node.alt || node.src || "image"}
            />
          );
        })}
      </div>
    </div>
  );
}
