"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

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

export function HtmlPreviewFrame({
  title,
  html,
  className,
  interactive = false,
  viewportWidth = 960,
  viewportHeight = 540,
}: {
  title: string;
  html: string;
  className?: string;
  interactive?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [frameStyle, setFrameStyle] = useState<CSSProperties>({
    transform: "scale(1)",
    transformOrigin: "0 0",
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateFrameStyle = () => {
      const { width, height } = container.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      
      const fitScale = Math.min(width / viewportWidth, height / viewportHeight);
      const scale = fitScale;
      
      const scaledWidth = viewportWidth * scale;
      const scaledHeight = viewportHeight * scale;
      
      const left = Math.max(0, (width - scaledWidth) / 2);
      const top = Math.max(0, (height - scaledHeight) / 2);
      
      setFrameStyle({
        transform: `translate(${left}px, ${top}px) scale(${scale})`,
        transformOrigin: "0 0",
      });
    };

    updateFrameStyle();
    const observer = new ResizeObserver(updateFrameStyle);
    observer.observe(container);
    return () => observer.disconnect();
  }, [viewportWidth, viewportHeight]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-full w-full overflow-hidden bg-transparent",
        className
      )}
    >
      <iframe
        title={title}
        srcDoc={withPreviewViewportStyle(html, viewportWidth, viewportHeight)}
        sandbox="allow-scripts allow-same-origin"
        loading="lazy"
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
