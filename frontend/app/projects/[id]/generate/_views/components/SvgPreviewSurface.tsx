"use client";

import { useEffect, useMemo, useReducer } from "react";
import { cn } from "@/lib/utils";
import {
  decodeSvgDataUrlToBlob,
  isRenderableSvgDataUrl,
} from "../svgPreview";

type SvgPreviewSurfaceProps = {
  svgDataUrl: string | null | undefined;
  alt: string;
  className?: string;
  objectClassName?: string;
  errorClassName?: string;
};

type SvgSurfaceState = {
  blobUrl: string | null;
  loadState: "loading" | "ready" | "error";
};

type SvgSurfaceAction =
  | { type: "loading" }
  | { type: "error" }
  | { type: "blob"; blobUrl: string }
  | { type: "ready" };

function svgSurfaceReducer(
  state: SvgSurfaceState,
  action: SvgSurfaceAction
): SvgSurfaceState {
  switch (action.type) {
    case "loading":
      return { blobUrl: null, loadState: "loading" };
    case "error":
      return { blobUrl: null, loadState: "error" };
    case "blob":
      return { blobUrl: action.blobUrl, loadState: "loading" };
    case "ready":
      return state.blobUrl ? { ...state, loadState: "ready" } : state;
    default:
      return state;
  }
}

export function SvgPreviewSurface({
  svgDataUrl,
  alt,
  className,
  objectClassName,
  errorClassName,
}: SvgPreviewSurfaceProps) {
  const [{ blobUrl, loadState }, dispatch] = useReducer(svgSurfaceReducer, {
    blobUrl: null,
    loadState: "loading",
  });

  const errorMessage = useMemo(() => {
    if (!svgDataUrl) {
      return "未提供 SVG 预览数据";
    }
    if (!isRenderableSvgDataUrl(svgDataUrl)) {
      return "SVG 预览数据格式无效";
    }
    return "SVG 预览加载失败";
  }, [svgDataUrl]);

  useEffect(() => {
    dispatch({ type: "loading" });
    if (!isRenderableSvgDataUrl(svgDataUrl)) {
      dispatch({ type: "error" });
      return;
    }

    const blob = decodeSvgDataUrlToBlob(svgDataUrl);
    if (!blob) {
      dispatch({ type: "error" });
      return;
    }

    const nextBlobUrl = URL.createObjectURL(blob);
    dispatch({ type: "blob", blobUrl: nextBlobUrl });
    return () => {
      if (typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(nextBlobUrl);
      }
    };
  }, [svgDataUrl]);

  if (!blobUrl || loadState === "error") {
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
        key={blobUrl}
        data={blobUrl}
        type="image/svg+xml"
        aria-label={alt}
        className={cn("h-full w-full bg-white", objectClassName)}
        onLoad={() => dispatch({ type: "ready" })}
        onError={() => dispatch({ type: "error" })}
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
      {loadState === "loading" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/55 text-xs font-medium text-black/50">
          正在加载 SVG…
        </div>
      ) : null}
    </div>
  );
}
