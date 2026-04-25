"use client";

import type { CSSProperties } from "react";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type HtmlPreviewFrameLayout = {
  scale: number;
  left: number;
  top: number;
  viewportWidth: number;
  viewportHeight: number;
};

type HtmlPreviewFrameProps = {
  title: string;
  html: string;
  className?: string;
  interactive?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  zoom?: number | "fit";
  onDocumentReady?: (doc: Document, iframe: HTMLIFrameElement) => void;
  onViewportLayoutChange?: (layout: HtmlPreviewFrameLayout) => void;
};

function withPreviewViewportStyle(html: string, width: number, height: number): string {
  const style = `
<style data-spectra-preview-viewport>
html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: transparent;
}
.spectra-page-preview {
  box-sizing: border-box !important;
  width: ${width}px !important;
  height: ${height}px !important;
  min-height: 0 !important;
  display: block !important;
  overflow: hidden !important;
  padding: 0 !important;
}
.spectra-page {
  width: ${width}px !important;
  height: ${height}px !important;
  min-height: 0 !important;
  aspect-ratio: 16 / 9 !important;
  max-width: 100% !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  margin: 0 !important;
}
</style>
  `.trim();
  if (html.includes("data-spectra-preview-viewport")) return html;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${style}</head>`);
  }
  return `${style}${html}`;
}

export const HtmlPreviewFrame = forwardRef<HTMLIFrameElement, HtmlPreviewFrameProps>(
  function HtmlPreviewFrame({
    title,
    html,
    className,
    interactive = false,
    viewportWidth = 960,
    viewportHeight = 540,
    zoom = "fit",
    onDocumentReady,
    onViewportLayoutChange,
  }, forwardedRef) {
    const containerRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const onDocumentReadyRef = useRef(onDocumentReady);
    const onViewportLayoutChangeRef = useRef(onViewportLayoutChange);
    const [frameStyle, setFrameStyle] = useState<CSSProperties>({
      transform: "scale(1)",
      transformOrigin: "0 0",
    });

    useEffect(() => {
      onDocumentReadyRef.current = onDocumentReady;
    }, [onDocumentReady]);

    useEffect(() => {
      onViewportLayoutChangeRef.current = onViewportLayoutChange;
    }, [onViewportLayoutChange]);

    const setRefs = useCallback((node: HTMLIFrameElement | null) => {
      iframeRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
        return;
      }
      if (forwardedRef) {
        forwardedRef.current = node;
      }
    }, [forwardedRef]);

    const notifyDocumentReady = useCallback(() => {
      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!iframe || !doc) return;
      onDocumentReadyRef.current?.(doc, iframe);
    }, []);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const updateFrameStyle = () => {
        const { width, height } = container.getBoundingClientRect();
        if (width <= 0 || height <= 0) return;

        const fitScale = Math.min(width / viewportWidth, height / viewportHeight);
        const baseScale = typeof zoom === "number" ? zoom : fitScale;
        const scale = zoom === "fit" ? fitScale : baseScale;

        const scaledWidth = viewportWidth * scale;
        const scaledHeight = viewportHeight * scale;

        const left = Math.max(0, (width - scaledWidth) / 2);
        const top = Math.max(0, (height - scaledHeight) / 2);

        const nextTransform = `translate(${left}px, ${top}px) scale(${scale})`;
        setFrameStyle((previous) => {
          if (
            previous.transform === nextTransform &&
            previous.transformOrigin === "0 0"
          ) {
            return previous;
          }
          return {
            transform: nextTransform,
            transformOrigin: "0 0",
          };
        });
        onViewportLayoutChangeRef.current?.({
          scale,
          left,
          top,
          viewportWidth,
          viewportHeight,
        });
      };

      updateFrameStyle();
      const observer = new ResizeObserver(updateFrameStyle);
      observer.observe(container);
      return () => observer.disconnect();
    }, [viewportHeight, viewportWidth, zoom]);

    useEffect(() => {
      notifyDocumentReady();
    }, [html, notifyDocumentReady]);

    return (
      <div
        ref={containerRef}
        className={cn(
          "relative h-full w-full overflow-hidden bg-transparent",
          className
        )}
      >
        <iframe
          ref={setRefs}
          title={title}
          srcDoc={withPreviewViewportStyle(html, viewportWidth, viewportHeight)}
          sandbox="allow-scripts allow-same-origin"
          loading="lazy"
          onLoad={notifyDocumentReady}
          tabIndex={interactive ? 0 : -1}
          className={cn(
            "absolute left-0 top-0 block origin-top-left border-0 bg-white",
            interactive ? "pointer-events-auto" : "pointer-events-none"
          )}
          style={{
            ...frameStyle,
            width: `${viewportWidth}px`,
            height: `${viewportHeight}px`,
          }}
        />
      </div>
    );
  }
);
