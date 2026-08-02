import ExcelJS from "exceljs";
import { describe, expect, test } from "vitest";
import { NativeTextError, parseNativeSource, parseNativeSourceFile } from "./native-text";

const bytes = (value: string) => new TextEncoder().encode(value);

describe("native Source parsing", () => {
  test.each(["txt", "md"] as const)("normalizes UTF-8 %s text", (format) => {
    expect(parseNativeSource(format, bytes("\uFEFF标题\r\n正文\r结尾"))).toEqual({
      schemaVersion: 1,
      kind: "text",
      format,
      content: "标题\n正文\n结尾",
    });
  });

  test.each([
    new Uint8Array([0xc3, 0x28]),
    bytes("\0hidden"),
    bytes("  \r\n "),
  ])("rejects invalid, binary, or empty text", (input) => {
    expect(() => parseNativeSource("txt", input)).toThrow(NativeTextError);
  });

  test("parses quoted multilingual CSV and keeps formula-like cells inert", () => {
    expect(
      parseNativeSource(
        "csv",
        bytes('\uFEFFname,note,value\r\n"张三","line 1\nline 2","=SUM(A1:A2)"\r\n'),
      ),
    ).toEqual({
      schemaVersion: 1,
      kind: "table",
      format: "csv",
      rows: [
        ["name", "note", "value"],
        ["张三", "line 1\nline 2", "=SUM(A1:A2)"],
      ],
    });
  });

  test("preserves XLSX sheet, merge, displayed value, and formula without executing it", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("数据");
    sheet.mergeCells("A1:B1");
    sheet.getCell("A1").value = "标题";
    sheet.getCell("A2").value = { formula: "1+1", result: 2 };
    sheet.getCell("A3").value = { formula: "SUM(A2:A2)" };
    const buffer = await workbook.xlsx.writeBuffer();

    await expect(parseNativeSourceFile("xlsx", new Uint8Array(buffer))).resolves.toMatchObject({
      schemaVersion: 2,
      kind: "workbook",
      format: "xlsx",
      sheets: [
        {
          name: "数据",
          mergedRanges: ["A1:B1"],
          rows: [
            {
              number: 1,
              cells: [{ address: "A1", value: "标题", displayValue: "标题" }],
            },
            {
              number: 2,
              cells: [{ address: "A2", value: "2", displayValue: "2", formula: "1+1" }],
            },
            {
              number: 3,
              cells: [
                {
                  address: "A3",
                  value: "",
                  displayValue: "",
                  formula: "SUM(A2:A2)",
                },
              ],
            },
          ],
        },
      ],
    });
  });

  test("rejects XLSX archives with entries outside the bounded OOXML allowlist", async () => {
    const malicious = Uint8Array.from(
      Buffer.from(
        "UEsDBBQAAAAAAMsQ91yDFtyMAQAAAAEAAAAUAAAALi4vc2hhcmVkU3RyaW5ncy54bWx4UEsBAhQDFAAAAAAAyxD3XIMW3IwBAAAAAQAAABQAAAAAAAAAAAAAAIABAAAAAC4uL3NoYXJlZFN0cmluZ3MueG1sUEsFBgAAAAABAAEAQgAAADMAAAAAAA==",
        "base64",
      ),
    );
    await expect(parseNativeSourceFile("xlsx", malicious)).rejects.toThrow(NativeTextError);
  });

  test.each([
    "a,b\n1",
    `value\n${"x".repeat(1024 * 1024 + 1)}`,
  ])("rejects malformed or oversized CSV records", (input) => {
    expect(() => parseNativeSource("csv", bytes(input))).toThrow(NativeTextError);
  });

  test("rejects CSV beyond the row budget", () => {
    const input = Array.from({ length: 100_001 }, (_, index) => String(index)).join("\n");
    expect(() => parseNativeSource("csv", bytes(input))).toThrow(NativeTextError);
  });

  test.each([
    ["json", '{"标题":"知识图谱"}'],
    ["yaml", "title: 知识图谱\ntags:\n  - AI\n"],
    ["yml", "defaults: &defaults\n  enabled: true\nitem:\n  <<: *defaults\n"],
    ["xml", '<?xml version="1.0"?><lesson><title>知识图谱</title></lesson>'],
  ] as const)("validates and preserves %s structured text", (format, content) => {
    expect(parseNativeSource(format, bytes(content))).toEqual({
      schemaVersion: 1,
      kind: "structured_text",
      format,
      content,
    });
  });

  test.each([
    ["json", '{"broken":}'],
    ["yaml", "duplicate: 1\nduplicate: 2\n"],
    ["xml", "<root><broken></root>"],
    ["xml", '<!DOCTYPE root [<!ENTITY secret "value">]><root>&secret;</root>'],
  ] as const)("rejects invalid or unsafe %s structured text", (format, content) => {
    expect(() => parseNativeSource(format, bytes(content))).toThrow(NativeTextError);
  });

  test("preserves HTML source for the safe Representation adapter", () => {
    const result = parseNativeSource(
      "html",
      bytes(
        "<html><body><h1>课程标题</h1><p>正文内容</p><script>steal()</script><style>.x{}</style><noscript>fallback</noscript></body></html>",
      ),
    );
    expect(result).toMatchObject({ schemaVersion: 1, kind: "structured_text", format: "html" });
    if (result.kind !== "structured_text") throw new Error("Expected an HTML source result");
    expect(result.content).toContain("课程标题");
    expect(result.content).toContain("正文内容");
    expect(result.content).toContain("steal");
  });

  test("bounds deeply nested HTML without overflowing the parser", () => {
    const content = `<p>保留正文</p>${"<div>".repeat(100_000)}深层内容${"</div>".repeat(100_000)}`;
    const result = parseNativeSource("html", bytes(content));
    expect(result).toMatchObject({
      schemaVersion: 1,
      kind: "structured_text",
      format: "html",
      content: expect.stringContaining("保留正文"),
    });
  }, 10_000);

  test.each([
    [
      "srt",
      "1\r\n00:00:01,000 --> 00:00:02,500\r\n第一句\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nSecond line\r\n",
    ],
    [
      "vtt",
      "WEBVTT\n\n00:00:01.000 --> 00:00:02.500\n第一句\n\n00:00:03.000 --> 00:00:04.000\nSecond line\n",
    ],
  ] as const)("normalizes %s cues into timed segments", (format, content) => {
    expect(parseNativeSource(format, bytes(content))).toEqual({
      schemaVersion: 1,
      kind: "subtitles",
      format,
      segments: [
        { startMs: 1_000, endMs: 2_500, text: "第一句" },
        { startMs: 3_000, endMs: 4_000, text: "Second line" },
      ],
    });
  });

  test.each([
    ["srt", "not subtitles"],
    ["vtt", "00:00:01.000 --> 00:00:02.000\nMissing header\n"],
    ["srt", "1\n00:00:02,000 --> 00:00:01,000\nBackwards\n"],
  ] as const)("rejects invalid %s subtitles", (format, content) => {
    expect(() => parseNativeSource(format, bytes(content))).toThrow(NativeTextError);
  });

  test("extracts notebook source and inert textual outputs while dropping active attachments", () => {
    const notebook = {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { language_info: { name: "python" } },
      cells: [
        { cell_type: "markdown", source: ["# 标题\r\n", "说明"], attachments: { ignored: {} } },
        {
          cell_type: "code",
          source: ["print('ok')\n"],
          execution_count: 1,
          outputs: [
            { output_type: "stream", text: ["secret output"] },
            {
              output_type: "display_data",
              data: { "text/html": "<b>visible output</b><script>never execute</script>" },
            },
          ],
        },
        { cell_type: "raw", source: "   " },
      ],
    };
    expect(parseNativeSource("ipynb", bytes(JSON.stringify(notebook)))).toEqual({
      schemaVersion: 1,
      kind: "notebook",
      format: "ipynb",
      language: "python",
      cells: [
        { cellType: "markdown", cellId: "generated-cell-1", content: "# 标题\n说明" },
        {
          cellType: "code",
          cellId: "generated-cell-2",
          content: "print('ok')\n",
          outputs: ["secret output", "visible output"],
        },
      ],
    });
  });

  test.each([
    { nbformat: 3, metadata: {}, cells: [] },
    { nbformat: 4, metadata: {}, cells: [] },
  ])("rejects an unsupported or empty notebook %#", (notebook) => {
    expect(() => parseNativeSource("ipynb", bytes(JSON.stringify(notebook)))).toThrow(
      NativeTextError,
    );
  });

  test("rejects notebooks with excessive source fragments", () => {
    const notebook = {
      nbformat: 4,
      metadata: {},
      cells: [
        {
          cell_type: "code",
          source: Array.from({ length: 10_001 }, () => "x"),
        },
      ],
    };
    expect(() => parseNativeSource("ipynb", bytes(JSON.stringify(notebook)))).toThrow(
      NativeTextError,
    );
  });

  test("rejects notebook cells beyond the extracted-byte budget", () => {
    const notebook = {
      nbformat: 4,
      metadata: {},
      cells: [{ cell_type: "code", source: "中".repeat(350_000) }],
    };
    expect(() => parseNativeSource("ipynb", bytes(JSON.stringify(notebook)))).toThrow(
      NativeTextError,
    );
  });

  test("rejects native text bytes beyond the owning format budget", () => {
    expect(() => parseNativeSource("txt", new Uint8Array(10 * 1024 * 1024 + 1))).toThrow(
      NativeTextError,
    );
  });

  test.each([
    ["py", "python"],
    ["ts", "typescript"],
    ["js", "javascript"],
    ["java", "java"],
    ["cpp", "cpp"],
    ["go", "go"],
    ["rs", "rust"],
    ["sql", "sql"],
  ] as const)("preserves incomplete %s code and records its language", (format, language) => {
    const content = "// 中文注释\r\nfunction incomplete(";
    expect(parseNativeSource(format, bytes(content))).toEqual({
      schemaVersion: 1,
      kind: "code",
      format,
      language,
      content: "// 中文注释\nfunction incomplete(",
    });
  });
});
