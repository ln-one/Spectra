import { type AnyExtension, mergeAttributes, Node } from "@tiptap/core";
import Mathematics from "@tiptap/extension-mathematics";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";

const TeachingDocumentTable = Node.create({
  content: "tableRow+",
  group: "block",
  isolating: true,
  name: "table",
  parseHTML() {
    return [{ tag: "table" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["table", mergeAttributes(HTMLAttributes), ["tbody", 0]];
  },
});

const TeachingDocumentTableRow = Node.create({
  content: "(tableHeader | tableCell)+",
  name: "tableRow",
  parseHTML() {
    return [{ tag: "tr" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["tr", mergeAttributes(HTMLAttributes), 0];
  },
});

const TeachingDocumentTableHeader = Node.create({
  content: "block+",
  isolating: true,
  name: "tableHeader",
  parseHTML() {
    return [{ tag: "th" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["th", mergeAttributes(HTMLAttributes), 0];
  },
});

const TeachingDocumentTableCell = Node.create({
  content: "block+",
  isolating: true,
  name: "tableCell",
  parseHTML() {
    return [{ tag: "td" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["td", mergeAttributes(HTMLAttributes), 0];
  },
});

export function createTeachingDocumentEditorExtensions(options: { codeBlock?: AnyExtension } = {}) {
  return [
    StarterKit.configure({
      ...(options.codeBlock ? { codeBlock: false } : {}),
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false },
      trailingNode: false,
      underline: false,
    }),
    ...(options.codeBlock ? [options.codeBlock] : []),
    Mathematics.configure({
      katexOptions: { throwOnError: false },
    }),
    TeachingDocumentTable,
    TeachingDocumentTableRow,
    TeachingDocumentTableHeader,
    TeachingDocumentTableCell,
    UniqueID.configure({
      types: [
        "heading",
        "paragraph",
        "bulletList",
        "orderedList",
        "listItem",
        "blockquote",
        "codeBlock",
        "horizontalRule",
        "table",
        "tableRow",
        "tableHeader",
        "tableCell",
        "blockMath",
      ],
    }),
  ];
}
