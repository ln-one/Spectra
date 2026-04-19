"use client";

import { useMemo, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DocumentSurfaceAdapter } from "../word/DocumentSurfaceAdapter";
import type { SpeakerNotesParagraph, SlideScriptItem } from "./types";

interface SpeakerNotesSurfaceAdapterProps {
  slides: SlideScriptItem[];
  activePage: number;
  onSelectPage: (page: number) => void;
  onSelectParagraph: (paragraph: SpeakerNotesParagraph, slide: SlideScriptItem) => void;
  selectedAnchorId?: string | null;
  canRefineParagraph?: boolean;
  onRefineParagraph?: (
    paragraph: SpeakerNotesParagraph,
    slide: SlideScriptItem,
    nextText?: string
  ) => void;
}

function buildDocumentForSlide(slide: SlideScriptItem | null): JSONContent {
  if (!slide) {
    return { type: "doc", content: [] };
  }
  const content: JSONContent[] = [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: `第 ${slide.page} 页 · ${slide.title}` }],
    },
  ];
  slide.sections.forEach((section) => {
    content.push({
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: section.title }],
    });
    section.paragraphs.forEach((paragraph) => {
      content.push({
        type: "paragraph",
        content: [{ type: "text", text: paragraph.text }],
      });
    });
  });
  return { type: "doc", content };
}

function SelectedParagraphEditor({
  paragraph,
  slide,
  canRefineParagraph = false,
  onRefineParagraph,
}: {
  paragraph: SpeakerNotesParagraph;
  slide: SlideScriptItem;
  canRefineParagraph?: boolean;
  onRefineParagraph?: (
    paragraph: SpeakerNotesParagraph,
    slide: SlideScriptItem,
    nextText?: string
  ) => void;
}) {
  const [draftText, setDraftText] = useState(paragraph.text);

  return (
    <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-950">当前已选中讲稿片段</p>
          <p className="text-xs text-emerald-800">锚点：{paragraph.anchorId}</p>
        </div>
        <Button
          type="button"
          disabled={!canRefineParagraph}
          onClick={() =>
            onRefineParagraph?.(paragraph, slide, draftText.trim() || paragraph.text)
          }
        >
          保存当前片段
        </Button>
      </div>
      <Textarea
        value={draftText}
        placeholder="编辑当前讲稿片段，保存后会以段落锚点回写新版本。"
        onChange={(event) => setDraftText(event.target.value)}
      />
    </div>
  );
}

export function SpeakerNotesSurfaceAdapter({
  slides,
  activePage,
  onSelectPage,
  onSelectParagraph,
  selectedAnchorId,
  canRefineParagraph = false,
  onRefineParagraph,
}: SpeakerNotesSurfaceAdapterProps) {
  const [localSelectedAnchorId, setLocalSelectedAnchorId] = useState<string | null>(
    selectedAnchorId ?? null
  );
  const activeSlide = useMemo(
    () => slides.find((item) => item.page === activePage) ?? slides[0] ?? null,
    [activePage, slides]
  );
  const selectedParagraph = useMemo(
    () =>
      activeSlide?.sections
        .flatMap((section) => section.paragraphs)
        .find((paragraph) => paragraph.anchorId === (selectedAnchorId ?? localSelectedAnchorId)) ?? null,
    [activeSlide, localSelectedAnchorId, selectedAnchorId]
  );
  const nextSlide =
    slides.find((item) => item.page === activePage + 1) ??
    slides[slides.findIndex((item) => item.page === activePage) + 1] ??
    null;

  if (!activeSlide) return null;

  return (
    <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
          <p className="text-xs font-semibold text-emerald-950">当前说课焦点</p>
          <p className="mt-1 text-sm font-medium text-emerald-900">
            第 {activeSlide.page} 页 · {activeSlide.title}
          </p>
          {selectedParagraph ? (
            <p className="mt-2 text-xs leading-5 text-emerald-800">
              当前锚点：{selectedParagraph.anchorId}
            </p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
          <p className="text-xs font-semibold text-zinc-900">页级导航</p>
          <div className="mt-3 space-y-2">
            {slides.map((slide) => (
              <button
                key={slide.page}
                type="button"
                onClick={() => onSelectPage(slide.page)}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                  slide.page === activePage
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-zinc-50 text-zinc-700"
                }`}
              >
                第 {slide.page} 页
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
          <p className="text-xs font-semibold text-zinc-900">段落锚点</p>
          <div className="mt-3 space-y-2">
            {activeSlide.sections.flatMap((section) =>
              section.paragraphs.map((paragraph) => {
                const isSelected =
                  (selectedAnchorId ?? localSelectedAnchorId) === paragraph.anchorId;
                return (
                  <button
                    key={paragraph.anchorId}
                    type="button"
                    onClick={() => {
                      setLocalSelectedAnchorId(paragraph.anchorId);
                      onSelectParagraph(paragraph, activeSlide);
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                        : "border-zinc-200 bg-zinc-50 text-zinc-700"
                    }`}
                  >
                    <div className="font-semibold">{section.title}</div>
                    <div className="mt-1 line-clamp-2">{paragraph.text}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
          <p className="text-xs font-semibold text-zinc-900">提词器视图</p>
          <p className="mt-1 text-[11px] text-zinc-600">
            当前页专注朗读，下一页只保留轻量预告，继续保持 page / anchor 语义而不退化成普通文档。
          </p>
        </div>
        <DocumentSurfaceAdapter
          document={buildDocumentForSlide(activeSlide)}
          title="讲稿备注"
          description="提词器式讲稿工作面已复用 document surface adapter，继续保留段落锚点和逐段微调。"
          badgeLabel="Document substrate"
        />
        {nextSlide ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold text-zinc-900">下一页预告</p>
            <p className="mt-2 text-sm font-medium text-zinc-800">
              第 {nextSlide.page} 页 · {nextSlide.title}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              继续保持提词器节奏，不在这里展开全文编辑。
            </p>
          </div>
        ) : null}
        {selectedParagraph ? (
          <SelectedParagraphEditor
            key={selectedParagraph.anchorId}
            paragraph={selectedParagraph}
            slide={activeSlide}
            canRefineParagraph={canRefineParagraph}
            onRefineParagraph={onRefineParagraph}
          />
        ) : null}
      </div>
    </div>
  );
}
