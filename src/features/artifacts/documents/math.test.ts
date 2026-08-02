import { describe, expect, it } from "vitest";
import { normalizeTeachingDocumentMathNodes, teachingDocumentMathSegments } from "./math";

describe("teachingDocumentMathSegments", () => {
  it("separates inline and display formulas from surrounding text", () => {
    expect(
      teachingDocumentMathSegments(String.raw`Prior $P(c)$.
$$
P(c_t|x_t) \rightarrow P(c_{t+1})
$$`),
    ).toEqual([
      { from: 0, kind: "text", to: 6 },
      { display: false, kind: "math", latex: "P(c)" },
      { from: 12, kind: "text", to: 14 },
      {
        display: true,
        kind: "math",
        latex: String.raw`P(c_t|x_t) \rightarrow P(c_{t+1})`,
      },
    ]);
  });
});

describe("normalizeTeachingDocumentMathNodes", () => {
  it("converts inline delimiters into native Tiptap math nodes while preserving text marks", () => {
    expect(
      normalizeTeachingDocumentMathNodes([
        {
          attrs: { id: "prior" },
          content: [
            { marks: [{ type: "bold" }], text: "Prior ", type: "text" },
            { text: "$P(c)$ and $100$", type: "text" },
          ],
          type: "paragraph",
        },
      ]),
    ).toEqual([
      {
        attrs: { id: "prior" },
        content: [
          { marks: [{ type: "bold" }], text: "Prior ", type: "text" },
          { attrs: { latex: "P(c)" }, type: "inlineMath" },
          { text: " and $100$", type: "text" },
        ],
        type: "paragraph",
      },
    ]);
  });

  it("converts projected block delimiters into a native Tiptap math node", () => {
    expect(
      normalizeTeachingDocumentMathNodes([
        {
          attrs: { id: "math-open" },
          content: [{ text: "$$", type: "text" }],
          type: "paragraph",
        },
        {
          attrs: { id: "math-source" },
          content: [{ text: String.raw`P(c|x) = \frac{P(x|c)P(c)}{P(x)}`, type: "text" }],
          type: "paragraph",
        },
        {
          attrs: { id: "math-close" },
          content: [{ text: "$$", type: "text" }],
          type: "paragraph",
        },
      ]),
    ).toEqual([
      {
        attrs: {
          id: "math-open",
          latex: String.raw`P(c|x) = \frac{P(x|c)P(c)}{P(x)}`,
        },
        type: "blockMath",
      },
    ]);
  });

  it("leaves unmatched delimiters as editable text", () => {
    const nodes = [
      {
        attrs: { id: "math-open" },
        content: [{ text: "$$", type: "text" }],
        type: "paragraph",
      },
      {
        attrs: { id: "body" },
        content: [{ text: "unfinished", type: "text" }],
        type: "paragraph",
      },
    ];

    expect(normalizeTeachingDocumentMathNodes(nodes)).toEqual(nodes);
  });

  it("converts a block formula embedded in a marked list item", () => {
    const [list] = normalizeTeachingDocumentMathNodes([
      {
        attrs: { id: "steps" },
        content: [
          {
            attrs: { id: "step-one" },
            content: [
              {
                attrs: { id: "step-one-paragraph" },
                content: [
                  {
                    marks: [{ type: "bold" }],
                    text: "贝叶斯更新",
                    type: "text",
                  },
                  {
                    text: String.raw`：将后验作为先验。
$$
P(c_t|x_t) \rightarrow P(c_{t+1})
$$`,
                    type: "text",
                  },
                ],
                type: "paragraph",
              },
            ],
            type: "listItem",
          },
        ],
        type: "orderedList",
      },
    ]);

    expect(list?.content?.[0]?.content).toEqual([
      {
        attrs: { id: "step-one-paragraph" },
        content: [
          {
            marks: [{ type: "bold" }],
            text: "贝叶斯更新",
            type: "text",
          },
          { text: "：将后验作为先验。\n", type: "text" },
        ],
        type: "paragraph",
      },
      {
        attrs: { latex: String.raw`P(c_t|x_t) \rightarrow P(c_{t+1})` },
        type: "blockMath",
      },
    ]);
  });
});
