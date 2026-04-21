"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { isRenderableSvgDataUrl } from "../svgPreview";

type SvgPreviewSurfaceProps = {
  svgDataUrl: string | null | undefined;
  alt: string;
  className?: string;
  objectClassName?: string;
  errorClassName?: string;
};

export function SvgPreviewSurface({
  svgDataUrl,
  alt,
  className,
  objectClassName,
  errorClassName,
}: SvgPreviewSurfaceProps) {
  const [failedSvgDataUrl, setFailedSvgDataUrl] = useState<string | null>(null);
  const canRender = isRenderableSvgDataUrl(svgDataUrl);
  const renderableSvgDataUrl = canRender ? svgDataUrl : null;
  const loadFailed = failedSvgDataUrl === renderableSvgDataUrl;

  const errorMessage = useMemo(() => {
    if (!svgDataUrl) {
      return "未提供 SVG 预览数据";
    }
    if (!isRenderableSvgDataUrl(svgDataUrl)) {
      return "SVG 预览数据格式无效";
    }
    return "SVG 预览加载失败";
  }, [svgDataUrl]);

  if (!renderableSvgDataUrl || loadFailed) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-2 bg-white px-4 text-center text-sm text-black/60",
          errorClassName,
          className
        )}
      >
        <p className="font-medium text-black/70">Pagevra SVG 预览不可用</p>
        <p className="max-w-[360px] text-xs text-black/45">{errorMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-white", className)}>
      <object
        data={renderableSvgDataUrl}
        type="image/svg+xml"
        aria-label={alt}
        className={cn("h-full w-full bg-white", objectClassName)}
        onError={() => setFailedSvgDataUrl(renderableSvgDataUrl)}
      >
        <div
          className={cn(
            "flex h-full w-full flex-col items-center justify-center gap-2 bg-white px-4 text-center text-sm text-black/60",
            errorClassName
          )}
        >
          <p className="font-medium text-black/70">Pagevra SVG 预览不可用</p>
          <p className="max-w-[360px] text-xs text-black/45">{errorMessage}</p>
        </div>
      </object>
    </div>
  );
}
