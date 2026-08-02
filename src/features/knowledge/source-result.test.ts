import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { SOURCE_FORMAT_REGISTRY, type SourceFileExtension } from "@/features/sources/validation";
import { projectRepresentation } from "./projection";
import { canonicalSourceRepresentation } from "./source-result";

const encoded = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const codeLanguages = {
  py: "python",
  ts: "typescript",
  js: "javascript",
  java: "java",
  cpp: "cpp",
  go: "go",
  rs: "rust",
  sql: "sql",
} as const;

function mineruZip(entries: Record<string, unknown | Uint8Array>) {
  return zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([name, value]) => [
        name,
        value instanceof Uint8Array ? value : strToU8(JSON.stringify(value)),
      ]),
    ),
  );
}

const mineruFixture = mineruZip({
  "document_content_list_v2.json": [
    [
      {
        type: "paragraph",
        content: { paragraph_content: [{ type: "text", content: "Searchable fact" }] },
      },
    ],
  ],
});

function nativeFixture(format: SourceFileExtension) {
  if (format === "txt" || format === "md")
    return { schemaVersion: 1, kind: "text", format, content: "Searchable fact" };
  if (format === "csv")
    return {
      schemaVersion: 1,
      kind: "table",
      format,
      rows: [
        ["name", "value"],
        ["fact", "42"],
      ],
    };
  if (format === "xlsx")
    return {
      schemaVersion: 2,
      kind: "workbook",
      format,
      sheets: [
        {
          id: "1",
          name: "Sheet1",
          mergedRanges: [],
          rows: [
            {
              number: 1,
              cells: [{ address: "A1", value: "fact", displayValue: "fact" }],
            },
          ],
        },
      ],
    };
  if (["json", "yaml", "yml", "xml", "html"].includes(format)) {
    const content =
      format === "json"
        ? '{"fact":42}'
        : format === "xml"
          ? "<root><fact>42</fact></root>"
          : format === "html"
            ? "<p>fact 42</p>"
            : "fact: 42";
    return { schemaVersion: 1, kind: "structured_text", format, content };
  }
  if (format === "srt" || format === "vtt")
    return {
      schemaVersion: 1,
      kind: "subtitles",
      format,
      segments: [{ startMs: 0, endMs: 1000, text: "fact 42" }],
    };
  if (format === "ipynb")
    return {
      schemaVersion: 1,
      kind: "notebook",
      format,
      cells: [{ cellType: "code", cellId: "cell-1", content: "answer = 42" }],
    };
  const codeFormat = format as keyof typeof codeLanguages;
  return {
    schemaVersion: 1,
    kind: "code",
    format: codeFormat,
    language: codeLanguages[codeFormat],
    content: "answer = 42",
  };
}

describe("canonical source representation", () => {
  it("reuses the authoritative native-text result shape", async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: 1,
        kind: "text",
        format: "md",
        content: "\uFEFF# H\r\n\r\nbody",
      }),
    );
    await expect(
      canonicalSourceRepresentation({ provider: "native_text", format: "md", bytes }),
    ).resolves.toMatchObject({ format: "md", family: "prose", adapterVersion: "2" });
  });

  it("rejects malformed or empty ingestion results", async () => {
    await expect(
      canonicalSourceRepresentation({
        provider: "native_text",
        format: "md",
        bytes: new TextEncoder().encode("{}"),
      }),
    ).rejects.toThrow();
  });

  it("keeps HTML source locations while excluding executable content from retrieval", async () => {
    const content =
      "<main><p>Visible fact</p><script>ignore me</script><noscript>fallback</noscript></main>";
    const result = await canonicalSourceRepresentation({
      provider: "native_text",
      format: "html",
      bytes: new TextEncoder().encode(
        JSON.stringify({ schemaVersion: 1, kind: "structured_text", format: "html", content }),
      ),
    });
    expect(result.blocks.map((block) => block.indexText).join(" ")).toContain("Visible fact");
    expect(result.blocks.map((block) => block.indexText).join(" ")).not.toContain("ignore me");
    expect(result.blocks[0]?.locator.kind).toBe("structured_path");
  });

  it.each(
    Object.keys(SOURCE_FORMAT_REGISTRY) as SourceFileExtension[],
  )("projects %s through its declared provider and native locator", async (format) => {
    const policy = SOURCE_FORMAT_REGISTRY[format];
    const bytes =
      policy.provider === "mineru"
        ? mineruFixture
        : encoded(
            policy.provider === "media_understanding"
              ? {
                  schemaVersion: 1,
                  kind: policy.mediaKind === "audio" ? "audio" : "video",
                  format,
                  summary: "summary",
                  segments: [{ startMs: 0, endMs: 1_000, description: "fact 42" }],
                  usage: {},
                }
              : nativeFixture(format),
          );
    const result = await canonicalSourceRepresentation({
      provider: policy.provider,
      format,
      bytes,
    });
    expect(result).toMatchObject({
      format,
      family: policy.family,
      adapterId: policy.adapter,
      adapterVersion: policy.provider === "mineru" ? "3" : "2",
    });
    expect(result.blocks.length).toBeGreaterThan(0);
    expect(result.blocks.every((block) => block.locator.kind === policy.locatorKind)).toBe(true);
    expect(
      result.blocks.every((block) => (block.indexText ?? block.exactText ?? "").trim().length > 0),
    ).toBe(true);
  });

  it("rejects a stored result whose provider or format does not match the registry", async () => {
    await expect(
      canonicalSourceRepresentation({
        provider: "native_text",
        format: "pdf",
        bytes: encoded(nativeFixture("txt")),
      }),
    ).rejects.toThrow("knowledge_source_provider_mismatch");
    await expect(
      canonicalSourceRepresentation({
        provider: "native_text",
        format: "md",
        bytes: encoded(nativeFixture("txt")),
      }),
    ).rejects.toThrow("knowledge_source_format_mismatch");
  });

  it("reads strict content-list V2 and keeps DOCX anchors with page regions", async () => {
    const result = await canonicalSourceRepresentation({
      provider: "mineru",
      format: "docx",
      bytes: mineruZip({
        "document_content_list_v2.json": [
          [
            {
              type: "title",
              content: { title_content: [{ type: "text", content: "Overview" }], level: 1 },
              bbox: [100, 100, 900, 180],
              anchor: "_Toc1",
            },
            {
              type: "paragraph",
              content: { paragraph_content: [{ type: "text", content: "Searchable fact" }] },
              bbox: [100, 200, 900, 300],
            },
            {
              type: "index",
              content: {
                list_type: "text_list",
                list_items: [
                  {
                    item_type: "text",
                    ilevel: 0,
                    prefix: "1.",
                    item_content: [{ type: "text", content: "Indexed section" }],
                    anchor: "_TocIndexed",
                  },
                ],
              },
            },
            {
              type: "table",
              content: {
                image_source: { path: "images/table.png" },
                table_caption: [{ type: "text", content: "Values" }],
                table_footnote: [],
                html: "<table><tr><td>A</td><td>42</td></tr></table>",
                table_type: "simple_table",
                table_nest_level: 1,
              },
              bbox: [100, 400, 900, 600],
            },
          ],
        ],
        "document_middle.json": { _backend: "office", _version_name: "3.0.0" },
        "images/table.png": Uint8Array.of(1),
      }),
    });

    expect(result).toMatchObject({
      adapterId: "mineru-content-v3",
      adapterVersion: "3",
      metadata: {
        providerOutputSchema: "content-list-v2",
        providerBackend: "office",
        providerVersion: "3.0.0",
      },
    });
    expect(result.blocks[0]).toMatchObject({
      headingPath: ["Overview"],
      fidelity: "source",
      locator: {
        kind: "page_regions",
        anchor: "_Toc1",
        regions: [
          {
            pageIndex: 0,
            boxes: [{ left: 0.1, top: 0.1, right: 0.9, bottom: 0.18 }],
          },
        ],
      },
    });
    expect(
      result.blocks.find((block) => block.exactText?.includes("Indexed section")),
    ).toMatchObject({
      locator: { kind: "page_regions", anchor: "_TocIndexed" },
    });
    expect(result.blocks.find((block) => block.content?.kind === "table_cells")).toMatchObject({
      content: {
        kind: "table_cells",
        cells: [
          { address: "A1", value: "A" },
          { address: "B1", value: "42" },
        ],
      },
    });
  });

  it("indexes valid V2 table HTML when MinerU emits a directory-only preview path", async () => {
    const result = await canonicalSourceRepresentation({
      provider: "mineru",
      format: "pdf",
      bytes: mineruZip({
        "document_content_list_v2.json": [
          [
            {
              type: "table",
              content: {
                image_source: { path: "images/" },
                table_caption: [],
                table_footnote: [],
                html: "<table><tr><td>Bayes</td><td>0.9</td></tr></table>",
                table_type: "simple_table",
                table_nest_level: 1,
              },
              bbox: [14, 107, 981, 966],
            },
          ],
        ],
      }),
    });

    expect(result.blocks).toContainEqual(
      expect.objectContaining({
        exactText: "A1: Bayes\tB1: 0.9",
        content: {
          kind: "table_cells",
          cells: [
            { address: "A1", value: "Bayes" },
            { address: "B1", value: "0.9" },
          ],
        },
      }),
    );
  });

  it("skips an empty V2 table placeholder instead of failing the whole document", async () => {
    const result = await canonicalSourceRepresentation({
      provider: "mineru",
      format: "pdf",
      bytes: mineruZip({
        "document_content_list_v2.json": [
          [
            {
              type: "table",
              content: {
                image_source: { path: "images/" },
                table_caption: [],
                table_footnote: [],
                html: "",
                table_type: "simple_table",
                table_nest_level: 1,
              },
              bbox: [14, 107, 981, 966],
            },
            {
              type: "paragraph",
              content: { paragraph_content: [{ type: "text", content: "Searchable fact" }] },
            },
          ],
        ],
      }),
    });

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({ exactText: "Searchable fact" });
  });

  it("ignores contract-valid empty V2 paragraphs", async () => {
    const result = await canonicalSourceRepresentation({
      provider: "mineru",
      format: "pdf",
      bytes: mineruZip({
        "document_content_list_v2.json": [
          [
            { type: "paragraph", content: { paragraph_content: [] } },
            {
              type: "paragraph",
              content: { paragraph_content: [{ type: "text", content: "kept" }] },
            },
          ],
        ],
      }),
    });

    expect(result.blocks.map((block) => block.exactText)).toEqual(["kept"]);
    expect(result.metadata?.providerOutputSchema).toBe("content-list-v2");
  });

  it("fails closed when V2 content is invalid", async () => {
    await expect(
      canonicalSourceRepresentation({
        provider: "mineru",
        format: "pdf",
        bytes: mineruZip({
          "document_content_list_v2.json": [[{ type: "future_type", content: {} }]],
        }),
      }),
    ).rejects.toThrow();
  });

  it("rejects V2 content schema drift and ambiguous native locator files", async () => {
    await expect(
      canonicalSourceRepresentation({
        provider: "mineru",
        format: "pdf",
        bytes: mineruZip({
          "document_content_list_v2.json": [
            [
              {
                type: "paragraph",
                content: {
                  paragraph_content: [{ type: "text", content: "fact" }],
                  future_field: true,
                },
              },
            ],
          ],
        }),
      }),
    ).rejects.toThrow("knowledge_mineru_schema_drift");

    await expect(
      canonicalSourceRepresentation({
        provider: "mineru",
        format: "pdf",
        bytes: mineruZip({
          "a/document_content_list_v2.json": [[]],
          "b/document_content_list_v2.json": [[]],
        }),
      }),
    ).rejects.toThrow("knowledge_mineru_result_ambiguous");
  });

  it("rejects unsafe or unresolved visual asset paths", async () => {
    for (const imgPath of ["../secret.png", "images/missing.png"]) {
      await expect(
        canonicalSourceRepresentation({
          provider: "mineru",
          format: "png",
          bytes: mineruZip({
            "image_content_list_v2.json": [
              [
                {
                  type: "image",
                  content: { image_source: { path: imgPath }, image_caption: [] },
                  bbox: [0, 0, 1000, 1000],
                },
              ],
            ],
          }),
        }),
      ).rejects.toThrow();
    }
  });

  it("allows whole-page regions and rejects invalid V2 boxes and rotations", async () => {
    const wholePage = await canonicalSourceRepresentation({
      provider: "mineru",
      format: "pdf",
      bytes: mineruZip({
        "document_content_list_v2.json": [
          [
            {
              type: "paragraph",
              content: { paragraph_content: [{ type: "text", content: "whole page" }] },
            },
          ],
        ],
      }),
    });
    expect(wholePage.blocks[0]?.locator).toEqual({
      kind: "page_regions",
      regions: [{ pageIndex: 0, boxes: [] }],
    });

    for (const invalid of [
      {
        type: "paragraph",
        content: { paragraph_content: [{ type: "text", content: "bad box" }] },
        bbox: [0, 0, 1001, 10],
      },
      {
        type: "paragraph",
        content: { paragraph_content: [{ type: "text", content: "bad rotation" }] },
        rotation: 45,
      },
    ]) {
      await expect(
        canonicalSourceRepresentation({
          provider: "mineru",
          format: "pdf",
          bytes: mineruZip({ "document_content_list_v2.json": [[invalid]] }),
        }),
      ).rejects.toThrow();
    }
  });

  it("preserves non-indexed visual regions and searchable footnotes without header pollution", async () => {
    const result = await canonicalSourceRepresentation({
      provider: "mineru",
      format: "png",
      bytes: mineruZip({
        "image_content_list_v2.json": [
          [
            {
              type: "header",
              content: { header_content: [{ type: "text", content: "Repeated header" }] },
              bbox: [0, 0, 1000, 50],
            },
            {
              type: "image",
              content: {
                image_source: { path: "images/region.png" },
                image_caption: [],
              },
              bbox: [0, 60, 1000, 800],
            },
            {
              type: "page_footnote",
              content: {
                page_footnote_content: [{ type: "text", content: "Important footnote" }],
              },
            },
            {
              type: "text",
              content: { paragraph_content: [{ type: "text", content: "Searchable body" }] },
            },
          ],
        ],
        "images/region.png": Uint8Array.of(1),
      }),
    });
    const projection = projectRepresentation({
      representationId: "visual-r1",
      blocks: result.blocks,
    });

    expect(result.blocks[0]).toMatchObject({ exactText: "Repeated header", indexText: null });
    expect(result.blocks[1]).toMatchObject({
      exactText: null,
      indexText: null,
      content: {
        kind: "visual_region",
        asset: { kind: "source_original" },
      },
    });
    expect(projection.blocks).toHaveLength(4);
    expect(projection.chunks.map((chunk) => chunk.indexText).join(" ")).not.toContain(
      "Repeated header",
    );
    expect(projection.evidenceUnits.map((unit) => unit.exactExcerpt)).not.toContain(
      "Repeated header",
    );
    expect(projection.chunks.map((chunk) => chunk.indexText).join(" ")).toContain(
      "Important footnote",
    );
    expect(
      projection.evidenceUnits.find((unit) => unit.content.kind === "visual_region"),
    ).toMatchObject({
      exactExcerpt: null,
      capacityUnits: 0,
    });
  });

  it("parses table cells and spans while preserving explicit cross-page regions", async () => {
    const result = await canonicalSourceRepresentation({
      provider: "mineru",
      format: "pdf",
      bytes: mineruZip({
        "table_content_list_v2.json": [
          [
            {
              type: "table",
              content: {
                html: '<table><tr><th rowspan="2">Name</th><th colspan="2">Values</th></tr><tr><td>A</td><td>B</td></tr></table>',
                table_caption: [{ type: "text", content: "Measured values" }],
                table_type: "complex_table",
                table_nest_level: 1,
              },
              page_regions: [
                { page_idx: 0, bbox: [100, 700, 900, 1000] },
                { page_idx: 1, bbox: [100, 0, 900, 300] },
              ],
            },
          ],
        ],
      }),
    });

    expect(result.blocks[0]).toMatchObject({
      content: {
        kind: "table_cells",
        cells: [
          { address: "A1", value: "Name", rowSpan: 2 },
          { address: "B1", value: "Values", colSpan: 2 },
          { address: "B2", value: "A" },
          { address: "C2", value: "B" },
        ],
      },
      locator: {
        kind: "page_regions",
        regions: [{ pageIndex: 0 }, { pageIndex: 1 }],
      },
    });
    expect(result.blocks[1]).toMatchObject({ exactText: "Measured values" });
  });

  it("uses the stable middle.json merge marker to preserve cross-page table regions", async () => {
    const tableContent = (html: string) => ({
      html,
      table_type: "simple_table",
      table_nest_level: 1,
      table_caption: [],
      table_footnote: [],
    });
    const result = await canonicalSourceRepresentation({
      provider: "mineru",
      format: "pdf",
      bytes: mineruZip({
        "document_content_list_v2.json": [
          [
            {
              type: "table",
              content: tableContent("<table><tr><td>Complete table</td></tr></table>"),
              bbox: [100, 700, 900, 1000],
            },
          ],
          [
            {
              type: "table",
              content: tableContent(""),
              bbox: [100, 0, 900, 300],
            },
            {
              type: "paragraph",
              content: { paragraph_content: [{ type: "text", content: "After table" }] },
            },
          ],
        ],
        "document_middle.json": {
          pdf_info: [
            { page_idx: 0, para_blocks: [{ type: "table", blocks: [{ lines_deleted: false }] }] },
            { page_idx: 1, para_blocks: [{ type: "table", blocks: [{ lines_deleted: true }] }] },
          ],
        },
      }),
    });

    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]).toMatchObject({
      content: { kind: "table_cells", cells: [{ address: "A1", value: "Complete table" }] },
      locator: {
        kind: "page_regions",
        regions: [
          { pageIndex: 0, boxes: [{ top: 0.7, bottom: 1 }] },
          { pageIndex: 1, boxes: [{ top: 0, bottom: 0.3 }] },
        ],
      },
    });
    expect(result.blocks[1]).toMatchObject({ exactText: "After table" });
  });

  it("fails closed for unproven cross-page tables and unsafe table HTML", async () => {
    const table = (html: string) => ({
      type: "table",
      content: {
        html,
        table_type: "simple_table",
        table_nest_level: 1,
        table_caption: [],
        table_footnote: [],
      },
    });
    await expect(
      canonicalSourceRepresentation({
        provider: "mineru",
        format: "pdf",
        bytes: mineruZip({
          "document_content_list_v2.json": [[table("")]],
          "document_middle.json": {
            pdf_info: [
              { page_idx: 0, para_blocks: [{ type: "table", blocks: [{ lines_deleted: true }] }] },
            ],
          },
        }),
      }),
    ).rejects.toThrow("knowledge_mineru_cross_page_table_invalid");

    await expect(
      canonicalSourceRepresentation({
        provider: "mineru",
        format: "pdf",
        bytes: mineruZip({
          "document_content_list_v2.json": [
            [table("<table><tr><td>A</td></tr></table>")],
            [
              {
                type: "paragraph",
                content: { paragraph_content: [{ type: "text", content: "Unrelated page" }] },
              },
            ],
            [table("")],
          ],
          "document_middle.json": {
            pdf_info: [
              { page_idx: 0, para_blocks: [{ type: "table", blocks: [] }] },
              { page_idx: 1, para_blocks: [{ type: "text", blocks: [] }] },
              { page_idx: 2, para_blocks: [{ type: "table", blocks: [{ lines_deleted: true }] }] },
            ],
          },
        }),
      }),
    ).rejects.toThrow("knowledge_mineru_cross_page_table_invalid");

    await expect(
      canonicalSourceRepresentation({
        provider: "mineru",
        format: "pdf",
        bytes: mineruZip({
          "document_content_list_v2.json": [[table("<table><tr><td>A</td></tr></table>")]],
          "document_middle.json": {
            pdf_info: [
              { page_idx: 0, para_blocks: [] },
              { page_idx: 0, para_blocks: [] },
            ],
          },
        }),
      }),
    ).rejects.toThrow("knowledge_mineru_middle_page_ambiguous");

    for (const unsafe of [
      "<script>x</script>",
      '<img src="remote">',
      '<span colspan="1000000">amplification</span>',
    ]) {
      await expect(
        canonicalSourceRepresentation({
          provider: "mineru",
          format: "pdf",
          bytes: mineruZip({
            "document_content_list_v2.json": [
              [
                table(
                  unsafe.includes("colspan")
                    ? `<table><tr><td colspan="1000000">amplification</td></tr></table>`
                    : `<table><tr><td>${unsafe}</td></tr></table>`,
                ),
              ],
            ],
          }),
        }),
      ).rejects.toThrow("knowledge_mineru_table");
    }
  });

  it("keeps colliding-looking YAML keys and notebook outputs locator-distinct", async () => {
    const yaml = await canonicalSourceRepresentation({
      provider: "native_text",
      format: "yaml",
      bytes: encoded({
        schemaVersion: 1,
        kind: "structured_text",
        format: "yaml",
        content: '"a.b": 1\na:\n  b: 2',
      }),
    });
    expect(new Set(yaml.blocks.map((block) => JSON.stringify(block.locator))).size).toBe(2);

    const notebook = await canonicalSourceRepresentation({
      provider: "native_text",
      format: "ipynb",
      bytes: encoded({
        schemaVersion: 1,
        kind: "notebook",
        format: "ipynb",
        cells: [{ cellType: "code", cellId: "same", content: "xx", outputs: ["yy", "zz"] }],
      }),
    });
    expect(new Set(notebook.blocks.map((block) => JSON.stringify(block.locator))).size).toBe(3);
  });
});
