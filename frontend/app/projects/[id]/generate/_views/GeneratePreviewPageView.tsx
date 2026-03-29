"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, FileDown, Loader2 } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { generateApi } from "@/lib/sdk";
import {
  buildArtifactDownloadUrl,
  resolvePreviewMode,
} from "@/lib/project/preview-workbench";
import { SlideCard } from "./SlideCard";
import { useGeneratePreviewState } from "./useGeneratePreviewState";
import { PreviewHeader } from "./components/PreviewHeader";
import { PreviewSlideSidebar } from "./components/PreviewSlideSidebar";
import { PreviewRightPanel } from "./components/PreviewRightPanel";

export default function GeneratePreviewPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const projectId =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
        ? params.id[0]
        : "";

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [projectTitle, setProjectTitle] = useState("PPT Workspace");
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [selectedEditSlideIndex, setSelectedEditSlideIndex] = useState<number | null>(
    null
  );
  const [editInstruction, setEditInstruction] = useState("");
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  const centerRef = useRef<HTMLDivElement>(null);

  const sessionIdFromQuery = searchParams?.get("session") || null;
  const runIdFromQuery = searchParams?.get("run") || null;
  const artifactIdFromQuery = searchParams?.get("artifact_id") || null;
  const searchQueryString = searchParams?.toString() || "";

  const projectBackHref = (sessionId: string | null) =>
    sessionId
      ? `/projects/${projectId}?session=${encodeURIComponent(sessionId)}`
      : `/projects/${projectId}`;

  const {
    slides,
    sessionRuns,
    isLoading,
    isExporting,
    isResuming,
    isSubmittingEdit,
    previewBlockedReason,
    isSessionGenerating,
    isOutlineGenerating,
    outlineSections,
    activeSessionId,
    currentArtifactId,
    editQueue,
    supportsImageEditing,
    handleExport,
    handleResume,
    submitSlideEdit,
    retryEditQueueItem,
    loadSlides,
  } = useGeneratePreviewState({
    projectId,
    sessionIdFromQuery,
    runIdFromQuery,
    artifactIdFromQuery,
  });

  const previewMode = useMemo(
    () =>
      resolvePreviewMode({
        isLoading,
        hasArtifact: Boolean(currentArtifactId),
        hasSlides: slides.length > 0,
        blockedReason: previewBlockedReason,
      }),
    [currentArtifactId, isLoading, previewBlockedReason, slides.length]
  );

  useEffect(() => {
    if (!sessionIdFromQuery || runIdFromQuery || !projectId) return;
    let cancelled = false;

    void (async () => {
      try {
        const runsResponse = await generateApi.listRuns(sessionIdFromQuery, {
          limit: 1,
        });
        const latestRunId = runsResponse?.data?.runs?.[0]?.run_id || null;
        if (!latestRunId || cancelled) return;

        const query = new URLSearchParams(searchQueryString);
        query.set("run", latestRunId);
        router.replace(`/projects/${projectId}/generate?${query.toString()}`);
      } catch {
        // Keep legacy session-only URL behavior when run lookup fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    projectId,
    router,
    runIdFromQuery,
    searchQueryString,
    sessionIdFromQuery,
  ]);

  const effectiveSelectedEditSlideIndex =
    selectedEditSlideIndex ?? (slides.length > 0 ? slides[0].index : null);

  const scrollToSlide = useCallback((index: number) => {
    const slideElement = document.querySelector(`[data-index="${index}"]`);
    if (slideElement) {
      slideElement.scrollIntoView({ behavior: "smooth", block: "center" });
      setActiveSlideIndex(index);
    }
  }, []);

  const selectedSlide = useMemo(
    () =>
      typeof effectiveSelectedEditSlideIndex === "number"
        ? slides.find((slide) => slide.index === effectiveSelectedEditSlideIndex) ||
          null
        : null,
    [effectiveSelectedEditSlideIndex, slides]
  );

  const artifactDownloadUrl =
    currentArtifactId && projectId
      ? buildArtifactDownloadUrl(projectId, currentArtifactId)
      : null;

  const handleSubmitEdit = useCallback(async () => {
    if (!selectedSlide || !editInstruction.trim()) return;
    await submitSlideEdit(selectedSlide, editInstruction.trim());
  }, [editInstruction, selectedSlide, submitSlideEdit]);

  const openRunArtifact = useCallback(
    (run: { run_id: string; artifact_id?: string | null }) => {
      if (!run.artifact_id) return;
      const query = new URLSearchParams(searchQueryString);
      query.set("run", run.run_id);
      query.set("artifact_id", String(run.artifact_id));
      router.replace(`/projects/${projectId}/generate?${query.toString()}`);
    },
    [projectId, router, searchQueryString]
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground">
        <PreviewHeader
          activeSessionId={activeSessionId}
          isSessionGenerating={isSessionGenerating}
          isEditingTitle={isEditingTitle}
          projectTitle={projectTitle}
          isExporting={isExporting}
          isResuming={isResuming}
          canResume={Boolean(activeSessionId) && !isSessionGenerating}
          isRightPanelOpen={isRightPanelOpen}
          onSetEditingTitle={setIsEditingTitle}
          onSetProjectTitle={setProjectTitle}
          onGoBack={() => router.push(projectBackHref(activeSessionId))}
          onExport={handleExport}
          onRefresh={() => {
            void loadSlides();
          }}
          onResume={() => {
            void handleResume();
          }}
          onToggleRightPanel={() => setIsRightPanelOpen((prev) => !prev)}
        />

        <main
          className={cn(
            "flex-1 min-h-0 grid",
            isRightPanelOpen
              ? "grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)_360px]"
              : "grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)]"
          )}
        >
          <PreviewSlideSidebar
            slides={slides}
            sessionRuns={sessionRuns}
            activeSlideIndex={activeSlideIndex}
            selectedEditSlideIndex={effectiveSelectedEditSlideIndex}
            isOutlineGenerating={isOutlineGenerating}
            outlineSections={outlineSections}
            onSelectSlide={scrollToSlide}
            onSelectEditSlide={(index) => {
              setSelectedEditSlideIndex(index);
              scrollToSlide(index);
            }}
            onOpenRunArtifact={openRunArtifact}
          />

          <section
            ref={centerRef}
            className="h-full overflow-y-auto bg-muted/10 p-4 md:p-6"
          >
            <div className="mx-auto w-full max-w-5xl space-y-4 pb-12">
              {previewMode === "artifact_ready" ? (
                <div className="rounded-2xl border bg-background p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Real output entry
                  </p>
                  <h3 className="mt-1 text-sm font-semibold">
                    PPT artifact exists for this run/session
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Slide cards below are text approximation. Final visual fidelity is in the downloadable PPT file.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={handleExport} disabled={isExporting}>
                      <FileDown className="mr-2 h-4 w-4" />
                      {isExporting ? "Exporting" : "Download artifact"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!artifactDownloadUrl}
                      onClick={() => {
                        if (!artifactDownloadUrl) return;
                        window.open(artifactDownloadUrl, "_blank", "noopener,noreferrer");
                      }}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open download URL
                    </Button>
                  </div>
                </div>
              ) : null}

              {previewMode === "loading" ? (
                <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border bg-background">
                  <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Loading preview workspace...</p>
                </div>
              ) : null}

              {previewMode === "blocked" ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <p className="font-semibold">Preview is currently blocked</p>
                  <p className="mt-1">{previewBlockedReason}</p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void handleResume();
                      }}
                      disabled={!activeSessionId || isResuming}
                    >
                      {isResuming ? "Resuming" : "Resume session"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(projectBackHref(activeSessionId))}
                    >
                      Back to project
                    </Button>
                  </div>
                </div>
              ) : null}

              {previewMode === "empty" ? (
                <div className="rounded-2xl border border-dashed bg-background p-5 text-sm text-muted-foreground">
                  No preview content yet. Start generation from project workspace, then reopen this page.
                </div>
              ) : null}

              {slides.length > 0 ? (
                <>
                  <div className="rounded-xl border bg-blue-50 px-3 py-2 text-xs text-blue-900">
                    Text approximation mode: this is generated markdown content, not final PPT page rendering.
                  </div>
                  <AnimatePresence>
                    {slides.map((slide, index) => (
                      <motion.div
                        key={slide.id || `slide-${index}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.28, ease: "easeOut" }}
                      >
                        <SlideCard
                          slide={slide}
                          isActive={activeSlideIndex === slide.index}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </>
              ) : null}
            </div>
          </section>

          {isRightPanelOpen ? (
            <PreviewRightPanel
              slides={slides}
              selectedSlideIndex={effectiveSelectedEditSlideIndex}
              instruction={editInstruction}
              queue={editQueue}
              isSubmittingEdit={isSubmittingEdit}
              supportsImageEditing={supportsImageEditing}
              onInstructionChange={setEditInstruction}
              onSelectSlideIndex={setSelectedEditSlideIndex}
              onUseTemplate={(template) => {
                setEditInstruction(template);
              }}
              onSubmitEdit={() => {
                void handleSubmitEdit();
              }}
              onRetryQueueItem={(itemId) => {
                void retryEditQueueItem(itemId);
              }}
            />
          ) : null}
        </main>
      </div>
    </TooltipProvider>
  );
}
