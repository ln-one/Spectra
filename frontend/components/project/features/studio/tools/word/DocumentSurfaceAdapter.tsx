"use client";

import type { JSONContent } from "@tiptap/react";
import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button } from "@/components/ui/button";
import { markdownToDoc } from "./documentContent";

interface DocumentSurfaceAdapterProps {
  markdown?: string;
  document?: JSONContent;
  title?: string;
  description?: string;
  badgeLabel?: string;
  editable?: boolean;
  onDocumentChange?: (document: JSONContent) => void;
}

export function DocumentSurfaceAdapter({
  markdown = "",
  document,
  title = "文档工作面",
  description = "当前已切到 document surface adapter，底层由 Tiptap 承载只读工作面。",
  badgeLabel = "Tiptap substrate",
  editable = false,
  onDocumentChange,
}: DocumentSurfaceAdapterProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: document ?? markdownToDoc(markdown),
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onDocumentChange?.(editor.getJSON());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-zinc max-w-none min-h-[280px] rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-sm leading-6 shadow-sm focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(document ?? markdownToDoc(markdown));
  }, [document, editor, markdown]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editable, editor]);

  const toolbarButtonClass = "h-8 px-3 text-xs";
  const shouldShowHeader = Boolean(title || description || badgeLabel);

  return (
    <div className="space-y-3">
      {shouldShowHeader ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            {title ? (
              <p className="text-sm font-semibold text-zinc-900">{title}</p>
            ) : null}
            {description ? (
              <p className="mt-1 text-[11px] text-zinc-500">
                {description}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {badgeLabel ? (
              <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-600">
                {badgeLabel}
              </span>
            ) : null}
            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-500">
              {editable ? "Editable" : "Read only"}
            </span>
          </div>
        </div>
      ) : null}
      {editable && editor ? (
        <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
          <Button
            type="button"
            size="sm"
            variant={editor.isActive("heading", { level: 2 }) ? "default" : "outline"}
            className={toolbarButtonClass}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            标题
          </Button>
          <Button
            type="button"
            size="sm"
            variant={editor.isActive("paragraph") ? "default" : "outline"}
            className={toolbarButtonClass}
            onClick={() => editor.chain().focus().setParagraph().run()}
          >
            正文
          </Button>
          <Button
            type="button"
            size="sm"
            variant={editor.isActive("bulletList") ? "default" : "outline"}
            className={toolbarButtonClass}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            项目符号
          </Button>
          <Button
            type="button"
            size="sm"
            variant={editor.isActive("orderedList") ? "default" : "outline"}
            className={toolbarButtonClass}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            有序列表
          </Button>
          <Button
            type="button"
            size="sm"
            variant={editor.isActive("bold") ? "default" : "outline"}
            className={toolbarButtonClass}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            加粗
          </Button>
          <Button
            type="button"
            size="sm"
            variant={editor.isActive("italic") ? "default" : "outline"}
            className={toolbarButtonClass}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            斜体
          </Button>
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
