"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { projectSpaceApi } from "@/lib/sdk/project-space";
import { cn } from "@/lib/utils";

type RenderState = "idle" | "loading" | "ready" | "failed";

declare global {
  interface Window {
    pptx2html?: (
      pptx: ArrayBuffer,
      resultElement: Element | string,
      thumbElement?: Element | string
    ) => Promise<number>;
  }
}

let scriptLoadingPromise: Promise<void> | null = null;

function ensurePptxRendererScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (typeof window.pptx2html === "function") return Promise.resolve();
  if (scriptLoadingPromise) return scriptLoadingPromise;

  scriptLoadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(
      "pptx2html-runtime-script"
    ) as HTMLScriptElement | null;

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => {
          scriptLoadingPromise = null;
          reject(new Error("Failed to load pptx2html runtime script."));
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.id = "pptx2html-runtime-script";
    script.src = "https://unpkg.com/pptx2html@0.3.4/dist/pptx2html.full.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadingPromise = null;
      reject(new Error("Failed to load pptx2html runtime script."));
    };
    document.body.appendChild(script);
  });

  return scriptLoadingPromise;
}

interface PptArtifactRendererProps {
  projectId: string;
  artifactId: string;
  className?: string;
  onRenderStateChange?: (state: RenderState) => void;
}

export function PptArtifactRenderer({
  projectId,
  artifactId,
  className,
  onRenderStateChange,
}: PptArtifactRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<RenderState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    onRenderStateChange?.(state);
  }, [onRenderStateChange, state]);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      if (!projectId || !artifactId || !containerRef.current) return;

      setState("loading");
      setErrorMessage("");
      containerRef.current.innerHTML = "";

      try {
        await ensurePptxRendererScript();
        if (cancelled) return;

        const renderer = window.pptx2html;
        if (typeof renderer !== "function") {
          throw new Error("PPT renderer is not ready.");
        }

        const blob = await projectSpaceApi.downloadArtifact(projectId, artifactId);
        if (cancelled) return;
        const buffer = await blob.arrayBuffer();
        if (cancelled) return;

        await renderer(buffer, containerRef.current);
        if (cancelled) return;

        setState("ready");
      } catch (error) {
        if (cancelled) return;

        setState("failed");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to render PPT artifact in browser."
        );
      }
    };

    void render();

    return () => {
      cancelled = true;
    };
  }, [artifactId, projectId]);

  return (
    <div className={cn("rounded-xl border bg-background p-3", className)}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          PPT Render
        </p>
        <span className="text-xs text-muted-foreground">
          {state === "loading"
            ? "Rendering..."
            : state === "ready"
              ? "Ready"
              : state === "failed"
                ? "Fallback"
                : "Idle"}
        </span>
      </div>

      {state === "loading" ? (
        <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Rendering PPT pages...
        </div>
      ) : null}

      {state === "failed" ? (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          PPT render failed. Showing text fallback preview.
          {errorMessage ? ` (${errorMessage})` : ""}
        </div>
      ) : null}

      <div
        ref={containerRef}
        className={cn(
          "min-h-[220px] overflow-auto",
          state === "loading" ? "hidden" : "block"
        )}
      />
    </div>
  );
}
