"use client";

import { useEffect, useMemo, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import type { SpeakerNotesParagraph, SlideScriptItem } from "./types";

interface SpeakerNotesSurfaceProps {
  slides: SlideScriptItem[];
  activePage: number;
  onSelectPage: (page: number) => void;
  onSelectParagraph: (paragraph: SpeakerNotesParagraph, slide: SlideScriptItem) => void;
  selectedAnchorId?: string | null;
  onRefineParagraph?: (paragraph: SpeakerNotesParagraph, slide: SlideScriptItem) => void;
}

function buildDoc(slides: SlideScriptItem[], activePage: number): JSONContent {
  const activeSlide = slides.find((item) => item.page === activePage) ?? slides[0];
  const content: JSONContent[] = [];
  if (!activeSlide) {
    return { type: "doc", content: [] };
  }
  content.push({
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text: `第 ${activeSlide.page} 页 · ${activeSlide.title}` }],
  });
  activeSlide.sections.forEach((section) => {
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

export function SpeakerNotesSurface({
  slides,
  activePage,
  onSelectPage,
  onSelectParagraph,
  selectedAnchorId,
  onRefineParagraph,
}: SpeakerNotesSurfaceProps) {
  const [selectedParagraphId, setSelectedParagraphId] = useState<string | null>(
    selectedAnchorId ?? null
  );
  const activeSlide = useMemo(
    () => slides.find((item) => item.page === activePage) ?? slides[0] ?? null,
    [activePage, slides]
  );
  const editor = useEditor({
    editable: false,
    immediatelyRender: false,
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } })],
    content: buildDoc(slides, activePage),
    editorProps: {
      attributes: {
        class:
          "min-h-[320px] rounded-2xl border border-zinc-200 bg-white px-5 py-4 prose prose-zinc max-w-none focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(buildDoc(slides, activePage));
  }, [activePage, editor, slides]);

  useEffect(() => {
    setSelectedParagraphId(selectedAnchorId ?? null);
  }, [selectedAnchorId]);

  if (!activeSlide) return null;

  return (
    <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
      <div className="space-y-3">
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
                const isSelected = selectedParagraphId === paragraph.anchorId;
                return (
                  <button
                    key={paragraph.anchorId}
                    type="button"
                    onClick={() => {
                      setSelectedParagraphId(paragraph.anchorId);
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
        <EditorContent editor={editor} />
        {selectedParagraphId ? (
          <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-emerald-950">当前已选中讲稿片段</p>
              <p className="text-xs text-emerald-800">
                锚点：{selectedParagraphId}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => {
                const paragraph = activeSlide.sections
                  .flatMap((section) => section.paragraphs)
                  .find((item) => item.anchorId === selectedParagraphId);
                if (paragraph) {
                  onRefineParagraph?.(paragraph, activeSlide);
                }
              }}
            >
              微调当前片段
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
