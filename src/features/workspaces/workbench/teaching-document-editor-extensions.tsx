"use client";

import { Extension, type JSONContent } from "@tiptap/core";
import CodeBlock from "@tiptap/extension-code-block";
import { DOMSerializer, Fragment, type Schema } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  type Editor,
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { useTranslations } from "next-intl";
import type { TeachingDocumentRevisionContent } from "@/features/artifacts/documents/contract";
import { createTeachingDocumentEditorExtensions } from "@/features/artifacts/documents/editor";
import { MermaidDiagram } from "@/features/artifacts/documents/MermaidDiagram";
import { normalizeTeachingDocumentMathNodes } from "@/features/artifacts/documents/math";
import { projectTeachingDocument } from "@/features/artifacts/documents/projector";

export type TeachingDocumentReviewDecoration = Array<{
  blockId: string;
  operation: "delete_block" | "insert_after" | "replace_block";
  text?: string;
}>;

export type TeachingDocumentAssistantDecoration = {
  blockIds: string[];
  from?: number;
  to?: number;
};

export type TeachingDocumentReviewLabels = {
  before: string;
  insert: string;
  pendingDelete: string;
  pendingInsert: string;
  pendingReplace: string;
  replace: string;
};

const refineReviewKey = new PluginKey<DecorationSet>("teachingDocumentRefineReview");
const assistantFocusKey = new PluginKey<DecorationSet>("teachingDocumentAssistantFocus");

function DocumentCodeBlockView({
  node,
}: {
  node: { attrs: { language?: string | null }; textContent: string };
}) {
  const t = useTranslations("Workbench");
  const mermaid = node.attrs.language === "mermaid";
  return (
    <NodeViewWrapper className={mermaid ? "teaching-document-mermaid-node" : undefined}>
      {mermaid ? (
        <div className="teaching-document-mermaid-preview" contentEditable={false}>
          <MermaidDiagram errorLabel={t("mermaidRenderFailed")} source={node.textContent} />
        </div>
      ) : null}
      <NodeViewContent
        className={mermaid ? "teaching-document-mermaid-source" : "teaching-document-code-source"}
      />
    </NodeViewWrapper>
  );
}

const DocumentCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(DocumentCodeBlockView);
  },
});

function appendProposalMarkdown(target: HTMLElement, markdown: string, schema: Schema) {
  try {
    const revision = projectTeachingDocument({
      outcome: "complete",
      rawOutput: markdown,
      requestedTitle: "AI proposal",
    }).revision;
    const nodes = revision.document.content.map((node) => schema.nodeFromJSON(node));
    target.append(DOMSerializer.fromSchema(schema).serializeFragment(Fragment.fromArray(nodes)));
  } catch {
    target.textContent = markdown;
  }
}

const TeachingDocumentAssistantFocus = Extension.create({
  name: "teachingDocumentAssistantFocus",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: assistantFocusKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, previous, _oldState, nextState) {
            const focus = transaction.getMeta(assistantFocusKey) as
              | TeachingDocumentAssistantDecoration
              | null
              | undefined;
            if (focus === undefined) return previous.map(transaction.mapping, nextState.doc);
            if (focus === null) return DecorationSet.empty;
            const attributes = {
              class: "teaching-document-assistant-focus",
              "data-assistant-focus": "true",
            };
            if (
              typeof focus.from === "number" &&
              typeof focus.to === "number" &&
              focus.from >= 0 &&
              focus.to > focus.from &&
              focus.to <= nextState.doc.content.size
            ) {
              return DecorationSet.create(nextState.doc, [
                Decoration.inline(focus.from, focus.to, attributes),
              ]);
            }
            const blockIds = new Set(focus.blockIds);
            const decorations: Decoration[] = [];
            nextState.doc.forEach((node, offset) => {
              if (typeof node.attrs.id !== "string" || !blockIds.has(node.attrs.id)) return;
              decorations.push(Decoration.node(offset, offset + node.nodeSize, attributes));
            });
            return DecorationSet.create(nextState.doc, decorations);
          },
        },
        props: { decorations: (state) => assistantFocusKey.getState(state) ?? null },
      }),
    ];
  },
});

const TeachingDocumentRefineReview = Extension.create<{
  labels: TeachingDocumentReviewLabels;
}>({
  name: "teachingDocumentRefineReview",
  addOptions() {
    return {
      labels: {
        before: "Before",
        insert: "Add",
        pendingDelete: "Content proposed for deletion",
        pendingInsert: "Proposed new content",
        pendingReplace: "Content proposed for replacement",
        replace: "Replace with",
      },
    };
  },
  addProseMirrorPlugins() {
    const labels = this.options.labels;
    return [
      new Plugin({
        key: refineReviewKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, previous, _oldState, nextState) {
            const review = transaction.getMeta(refineReviewKey) as
              | TeachingDocumentReviewDecoration
              | null
              | undefined;
            if (review === undefined) return previous.map(transaction.mapping, nextState.doc);
            if (review === null) return DecorationSet.empty;
            const decorations: Decoration[] = [];
            nextState.doc.forEach((node, offset) => {
              const blockId = typeof node.attrs.id === "string" ? node.attrs.id : null;
              const change = review.find((candidate) => candidate.blockId === blockId);
              if (!change) return;
              const from = offset;
              const to = offset + node.nodeSize;
              if (change.operation !== "insert_after") {
                const beforeLabel =
                  change.operation === "delete_block" ? labels.pendingDelete : labels.before;
                decorations.push(
                  Decoration.widget(
                    from,
                    () => {
                      const label = document.createElement("span");
                      label.className = "teaching-document-refine-before-label";
                      label.dataset.changeKind = "remove";
                      label.textContent = beforeLabel;
                      return label;
                    },
                    { side: -1 },
                  ),
                  Decoration.node(from, to, {
                    "aria-label":
                      change.operation === "delete_block"
                        ? labels.pendingDelete
                        : labels.pendingReplace,
                    class: "teaching-document-refine-removed",
                  }),
                );
              }
              if (!change.text) return;
              const changedText = change.text;
              decorations.push(
                Decoration.widget(to, () => {
                  const wrapper = document.createElement("section");
                  wrapper.className = "teaching-document-refine-inserted";
                  wrapper.setAttribute("aria-label", labels.pendingInsert);
                  const label = document.createElement("span");
                  label.className = "teaching-document-refine-label";
                  label.dataset.changeKind = "add";
                  label.textContent =
                    change.operation === "insert_after" ? labels.insert : labels.replace;
                  const content = document.createElement("div");
                  content.className = "teaching-document-refine-copy";
                  appendProposalMarkdown(content, changedText, nextState.schema);
                  wrapper.append(label, content);
                  return wrapper;
                }),
              );
            });
            return DecorationSet.create(nextState.doc, decorations);
          },
        },
        props: { decorations: (state) => refineReviewKey.getState(state) ?? null },
      }),
    ];
  },
});

export function createWorkbenchTeachingDocumentExtensions(labels: TeachingDocumentReviewLabels) {
  return createTeachingDocumentEditorExtensions({ codeBlock: DocumentCodeBlock }).concat(
    TeachingDocumentAssistantFocus,
    TeachingDocumentRefineReview.configure({ labels }),
  );
}

export function setTeachingDocumentAssistantDecoration(
  editor: Editor,
  focus: TeachingDocumentAssistantDecoration | null,
) {
  editor.view.dispatch(editor.state.tr.setMeta(assistantFocusKey, focus));
}

export function setTeachingDocumentReviewDecoration(
  editor: Editor,
  review: TeachingDocumentReviewDecoration | null,
) {
  editor.view.dispatch(editor.state.tr.setMeta(refineReviewKey, review));
}

export function toTeachingDocumentEditorContent(
  revision: TeachingDocumentRevisionContent,
  title: string,
): JSONContent {
  function jsonContent(value: unknown): JSONContent {
    if (!value || typeof value !== "object") return {};
    const node = value as Record<string, unknown>;
    const output: JSONContent = {};
    if (typeof node.type === "string") output.type = node.type;
    if (typeof node.text === "string") output.text = node.text;
    if (node.attrs && typeof node.attrs === "object") output.attrs = node.attrs;
    if (Array.isArray(node.marks)) {
      const markTypes = new Set<string>();
      output.marks = node.marks.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const mark = candidate as Record<string, unknown>;
        if (typeof mark.type !== "string" || markTypes.has(mark.type)) return [];
        markTypes.add(mark.type);
        return [
          {
            ...(mark.attrs && typeof mark.attrs === "object" ? { attrs: mark.attrs } : {}),
            type: mark.type,
          },
        ];
      });
    }
    if (Array.isArray(node.content)) output.content = node.content.map(jsonContent);
    return output;
  }

  function textContent(node: JSONContent): string {
    return node.text ?? node.content?.map(textContent).join("") ?? "";
  }

  const normalizedTitle = title.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  const nodes = normalizeTeachingDocumentMathNodes(revision.document.content.map(jsonContent));
  const [first, ...rest] = nodes;
  const content =
    first?.type === "heading" &&
    textContent(first).normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() ===
      normalizedTitle
      ? rest
      : nodes;
  return {
    content:
      content.length > 0 ? content : [{ attrs: { id: "document-empty-body" }, type: "paragraph" }],
    type: "doc",
  };
}
