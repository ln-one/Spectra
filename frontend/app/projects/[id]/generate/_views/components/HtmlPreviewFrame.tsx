"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const PREVIEW_VIEWPORT_STYLE = `
<style data-spectra-preview-viewport>
html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
}
.spectra-page-preview {
  box-sizing: border-box !important;
  width: 1280px !important;
  height: 720px !important;
  min-height: 0 !important;
  display: block !important;
  overflow: hidden !important;
  padding: 0 !important;
}
.spectra-page {
  width: 1280px !important;
  height: 720px !important;
  min-height: 0 !important;
  aspect-ratio: 16 / 9 !important;
  max-width: 100% !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}
</style>
`.trim();

function withPreviewViewportStyle(html: string): string {
  if (html.includes("data-spectra-preview-viewport")) return html;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${PREVIEW_VIEWPORT_STYLE}</head>`);
  }
  return `${PREVIEW_VIEWPORT_STYLE}${html}`;
}

export function HtmlPreviewFrame({
  title,
  html,
  className,
  interactive = false,
}: {
  title: string;
  html: string;
  className?: string;
  interactive?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [frameStyle, setFrameStyle] = useState<CSSProperties>({
    transform: "scale(1)",
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateFrameStyle = () => {
      const { width, height } = container.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const scale = Math.min(width / 1280, height / 720);
      const left = (width - 1280 * scale) / 2;
      const top = (height - 720 * scale) / 2;
      setFrameStyle({
        transform: `translate(${left}px, ${top}px) scale(${scale})`,
      });
    };

    updateFrameStyle();
    const observer = new ResizeObserver(updateFrameStyle);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-full w-full overflow-hidden bg-white",
        className
      )}
    >
      <iframe
        title={title}
        srcDoc={withPreviewViewportStyle(html)}
        sandbox=""
        loading="lazy"
        tabIndex={interactive ? 0 : -1}
        className={cn(
          "absolute left-0 top-0 block h-[720px] w-[1280px] origin-top-left border-0 bg-white",
          interactive ? "pointer-events-auto" : "pointer-events-none"
        )}
        style={frameStyle}
      />
    </div>
  );
}
