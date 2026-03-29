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

const RUNTIME_SCRIPT_ID = "pptx2html-runtime-script";
const RUNTIME_SCRIPT_SRC =
  "https://unpkg.com/pptx2html@0.3.4/dist/pptx2html.full.min.js";

let runtimeLoadingPromise: Promise<void> | null = null;

function ensureRuntimeAsset(
  id: string,
  create: () => HTMLScriptElement | HTMLLinkElement
): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const existing = document.getElementById(id) as
    | (HTMLScriptElement & { dataset: DOMStringMap })
    | (HTMLLinkElement & { dataset: DOMStringMap })
    | null;

  if (existing?.dataset?.loaded === "true") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const el = existing ?? create();
    el.id = id;

    const onLoad = () => {
      el.dataset.loaded = "true";
      resolve();
    };
    const onError = () => reject(new Error(`Failed to load runtime asset: ${id}`));

    el.addEventListener("load", onLoad, { once: true });
    el.addEventListener("error", onError, { once: true });

    if (!existing) {
      if (el instanceof HTMLLinkElement) {
        document.head.appendChild(el);
      } else {
        document.body.appendChild(el);
      }
    }
  });
}

function ensurePptxRuntime(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (typeof window.pptx2html === "function") return Promise.resolve();
  if (runtimeLoadingPromise) return runtimeLoadingPromise;

  runtimeLoadingPromise = (async () => {
    await ensureRuntimeAsset(RUNTIME_SCRIPT_ID, () => {
      const script = document.createElement("script");
      script.src = RUNTIME_SCRIPT_SRC;
      script.async = true;
      return script;
    });

    if (typeof window.pptx2html !== "function") {
      throw new Error("PPT runtime did not initialize.");
    }
  })().catch((error) => {
    runtimeLoadingPromise = null;
    throw error;
  });

  return runtimeLoadingPromise;
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
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    onRenderStateChange?.(state);
  }, [onRenderStateChange, state]);

  useEffect(() => {
    let cancelled = false;

    const renderArtifact = async () => {
      if (!projectId || !artifactId || !containerRef.current) return;

      setState("loading");
      setErrorMessage("");
      containerRef.current.innerHTML = "";

      try {
        await ensurePptxRuntime();
        if (cancelled) return;

        const renderer = window.pptx2html;
        if (typeof renderer !== "function") {
          throw new Error("PPT renderer is unavailable.");
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
          error instanceof Error ? error.message : "Unknown render failure."
        );
      }
    };

    void renderArtifact();

    return () => {
      cancelled = true;
    };
  }, [artifactId, projectId]);

  return (
    <div className={cn("rounded-xl border bg-white/90 p-3 shadow-sm", className)}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-700">PPT render</p>
        <span className="text-xs text-zinc-500">
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
        <div className="flex min-h-[220px] items-center justify-center text-sm text-zinc-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Rendering real PPT pages...
        </div>
      ) : null}

      {state === "failed" ? (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Real PPT render failed, text preview fallback is shown.
          {errorMessage ? ` (${errorMessage})` : ""}
        </div>
      ) : null}

      <div
        ref={containerRef}
        className={cn(
          "min-h-[220px] overflow-auto rounded-md bg-white",
          state === "loading" ? "hidden" : "block"
        )}
      />
    </div>
  );
}
