import { useState } from "react";
import { Mic2 } from "lucide-react";
import { ArtifactWorkbenchShell } from "../ArtifactWorkbenchShell";
import type { ToolFlowContext } from "../types";
import { buildArtifactWorkbenchViewModel } from "../workbenchViewModel";
import { SpeakerNotesSurfaceAdapter } from "./SpeakerNotesSurfaceAdapter";
import type {
  SlideScriptItem,
  SourcePptSlidePreview,
  SpeakerNotesParagraph,
  SpeakerNotesSection,
} from "./types";

interface PreviewStepProps {
  activePage: number;
  lastGeneratedAt: string | null;
  highlightTransition: boolean;
  sourceSlides?: SourcePptSlidePreview[];
  flowContext?: ToolFlowContext;
  onSelectPage: (page: number) => void;
}

function parseBackendScripts(flowContext?: ToolFlowContext): SlideScriptItem[] {
  if (!flowContext?.resolvedArtifact) return [];
  if (flowContext.resolvedArtifact.contentKind !== "json") return [];
  if (
    !flowContext.resolvedArtifact.content ||
    typeof flowContext.resolvedArtifact.content !== "object"
  ) {
    return [];
  }

  const content = flowContext.resolvedArtifact.content as Record<
    string,
    unknown
  >;
  const rawSlides = Array.isArray(content.slides) ? content.slides : [];
  const scripts: SlideScriptItem[] = [];

  for (let index = 0; index < rawSlides.length; index += 1) {
    const slide = rawSlides[index];
    if (!slide || typeof slide !== "object") continue;

    const row = slide as Record<string, unknown>;
    const page = Number(row.page ?? index + 1);
    const title =
      typeof row.title === "string" && row.title.trim()
        ? row.title.trim()
        : `第 ${index + 1} 页`;
    const sectionsRaw = Array.isArray(row.sections) ? row.sections : [];
    let sections: SpeakerNotesSection[] = sectionsRaw
      .map((section, sectionIndex) => {
        if (!section || typeof section !== "object") return null;
        const sectionRow = section as Record<string, unknown>;
        const paragraphsRaw = Array.isArray(sectionRow.paragraphs)
          ? sectionRow.paragraphs
          : [];
        const paragraphs: SpeakerNotesParagraph[] = paragraphsRaw
          .map((paragraph, paragraphIndex) => {
            if (!paragraph || typeof paragraph !== "object") return null;
            const paragraphRow = paragraph as Record<string, unknown>;
            const text =
              typeof paragraphRow.text === "string"
                ? paragraphRow.text.trim()
                : "";
            const anchorId =
              typeof paragraphRow.anchor_id === "string"
                ? paragraphRow.anchor_id.trim()
                : "";
            if (!text || !anchorId) return null;
            return {
              id:
                typeof paragraphRow.id === "string" && paragraphRow.id.trim()
                  ? paragraphRow.id.trim()
                  : `${page}-paragraph-${paragraphIndex + 1}`,
              anchorId,
              text,
              role:
                typeof paragraphRow.role === "string" && paragraphRow.role.trim()
                  ? paragraphRow.role.trim()
                  : "script",
            };
          })
          .filter((item): item is SpeakerNotesParagraph => Boolean(item));
        if (paragraphs.length === 0) return null;
        return {
          id:
            typeof sectionRow.id === "string" && sectionRow.id.trim()
              ? sectionRow.id.trim()
              : `${page}-section-${sectionIndex + 1}`,
          title:
            typeof sectionRow.title === "string" && sectionRow.title.trim()
              ? sectionRow.title.trim()
              : `段落 ${sectionIndex + 1}`,
          paragraphs,
        };
      })
      .filter((item): item is SpeakerNotesSection => Boolean(item));

    if (sections.length === 0) {
      const fallbackParagraphs: SpeakerNotesParagraph[] = [];
      const script =
        typeof row.script === "string" && row.script.trim()
          ? row.script.trim()
          : typeof row.summary === "string" && row.summary.trim()
            ? row.summary.trim()
            : "";
      const actionHint =
        typeof row.action_hint === "string" ? row.action_hint.trim() : "";
      const transitionLine =
        typeof row.transition_line === "string"
          ? row.transition_line.trim()
          : "";
      if (script) {
        fallbackParagraphs.push({
          id: `${page}-paragraph-1`,
          anchorId: `speaker_notes:v2:slide-${page}:paragraph-1`,
          text: script,
          role: "script",
        });
      }
      if (actionHint) {
        fallbackParagraphs.push({
          id: `${page}-paragraph-2`,
          anchorId: `speaker_notes:v2:slide-${page}:paragraph-2`,
          text: actionHint,
          role: "action_hint",
        });
      }
      if (transitionLine) {
        fallbackParagraphs.push({
          id: `${page}-paragraph-3`,
          anchorId: `speaker_notes:v2:slide-${page}:paragraph-3`,
          text: transitionLine,
          role: "transition",
        });
      }
      if (fallbackParagraphs.length > 0) {
        sections = [
          {
            id: `${page}-section-1`,
            title: "讲解内容",
            paragraphs: fallbackParagraphs,
          },
        ];
      }
    }

    if (!Number.isFinite(page) || sections.length === 0) continue;
    scripts.push({
      page,
      title,
      slideId:
        typeof row.id === "string" && row.id.trim() ? row.id.trim() : undefined,
      sections,
    });
  }

  return scripts;
}

export function PreviewStep({
  activePage,
  lastGeneratedAt,
  highlightTransition,
  sourceSlides = [],
  flowContext,
  onSelectPage,
}: PreviewStepProps) {
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ?? "正在等待后端返回真实讲稿内容。";
  const backendScripts = parseBackendScripts(flowContext);
  const artifactContent =
    flowContext?.resolvedArtifact?.content &&
    typeof flowContext.resolvedArtifact.content === "object"
      ? (flowContext.resolvedArtifact.content as Record<string, unknown>)
      : null;
  const summary =
    artifactContent && typeof artifactContent.summary === "string"
      ? artifactContent.summary
      : "";
  const sourceSlideByPage = new Map(
    sourceSlides.map((item) => [item.page, item])
  );
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const artifactId = flowContext?.resolvedArtifact?.artifactId ?? null;
  const canRefineParagraph = Boolean(
    artifactId && flowContext?.onStructuredRefineArtifact
  );
  const viewModel = buildArtifactWorkbenchViewModel(
    flowContext,
    lastGeneratedAt,
    summary || "已生成逐页讲稿。"
  );

  return (
    <ArtifactWorkbenchShell
      flowContext={{
        ...flowContext,
        capabilityStatus,
        capabilityReason,
      }}
      viewModel={viewModel}
      emptyState={
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
          <Mic2 className="mx-auto h-8 w-8 text-zinc-400" />
          <p className="mt-3 text-sm font-medium text-zinc-700">
            暂未收到后端真实说课讲稿
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            当前只展示后端真实返回结果，不再渲染前端示意讲稿。
          </p>
        </div>
      }
    >
      {backendScripts.length > 0 ? (
        <>
            <SpeakerNotesSurfaceAdapter
              slides={backendScripts}
              activePage={activePage}
              selectedAnchorId={selectedAnchorId}
              onSelectPage={onSelectPage}
              onSelectParagraph={(paragraph, slide) => {
                setSelectedAnchorId(paragraph.anchorId);
                const sourceSlide = sourceSlideByPage.get(slide.page);
                if (sourceSlide?.page && sourceSlide.page !== activePage) {
                  onSelectPage(sourceSlide.page);
                }
              }}
              onRefineParagraph={(paragraph, slide, nextText) => {
                if (!artifactId || !flowContext?.onStructuredRefineArtifact) {
                  return;
                }
                void flowContext.onStructuredRefineArtifact({
                  artifactId,
                  message: nextText || paragraph.text,
                  refineMode: "structured_refine",
                  selectionAnchor: {
                    scope: "paragraph",
                    anchor_id: paragraph.anchorId,
                    artifact_id: artifactId,
                    label: `${slide.title} / ${paragraph.role}`,
                  },
                  config: {
                    active_page: slide.page,
                    highlight_transition: highlightTransition,
                  },
                });
              }}
              canRefineParagraph={canRefineParagraph}
            />
        </>
      ) : null}
    </ArtifactWorkbenchShell>
  );
}
