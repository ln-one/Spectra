import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { z } from "zod";
import { knowledgeProfileV3 } from "../../src/features/knowledge/profile";
import { projectRepresentation } from "../../src/features/knowledge/projection";
import { canonicalSourceRepresentation } from "../../src/features/knowledge/source-result";
import { parseNativeSourceFile } from "../../src/features/sources/ingestion/native-text";
import type { SourceNativeTextExtension } from "../../src/features/sources/validation";
import { runSingleDocumentKnowledgeSmoke } from "../knowledge-acceptance/runner";

const FACT = "SPECTRA_FORMAT_FACT_42";
const formats = [
  "txt",
  "md",
  "csv",
  "xlsx",
  "json",
  "yaml",
  "yml",
  "xml",
  "html",
  "srt",
  "vtt",
  "ipynb",
  "py",
  "ts",
  "js",
  "java",
  "cpp",
  "go",
  "rs",
  "sql",
] as const satisfies readonly SourceNativeTextExtension[];

const expectedLocatorKinds = {
  txt: "text_range",
  md: "text_range",
  csv: "grid_range",
  xlsx: "grid_range",
  json: "structured_path",
  yaml: "structured_path",
  yml: "structured_path",
  xml: "structured_path",
  html: "structured_path",
  srt: "cue_range",
  vtt: "cue_range",
  ipynb: "notebook_cell",
  py: "code_range",
  ts: "code_range",
  js: "code_range",
  java: "code_range",
  cpp: "code_range",
  go: "code_range",
  rs: "code_range",
  sql: "code_range",
} as const satisfies Record<SourceNativeTextExtension, string>;

const reportSchema = z
  .object({
    schemaVersion: z.literal(1),
    createdAt: z.string(),
    formats: z.array(
      z
        .object({
          format: z.enum(formats),
          sourceBytes: z.number().int().positive(),
          resultBytes: z.number().int().positive(),
          blockCount: z.number().int().positive(),
          chunkCount: z.number().int().positive(),
          evidenceCount: z.number().int().positive(),
          locatorKinds: z.array(z.string().min(1)).min(1),
          stable: z.literal(true),
          retrieved: z.literal(true),
          matchedExcerpt: z.string().includes(FACT),
        })
        .strict(),
    ),
  })
  .strict();

const utf8 = (value: string) => new TextEncoder().encode(value);

async function sourceBytes(format: SourceNativeTextExtension) {
  switch (format) {
    case "xlsx": {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Facts");
      sheet.addRow(["name", "value"]);
      sheet.addRow(["retrieval", FACT]);
      sheet.mergeCells("A3:B3");
      sheet.getCell("A3").value = "Merged locator fixture";
      return new Uint8Array(await workbook.xlsx.writeBuffer());
    }
    case "txt":
      return utf8(`Native text fixture\n${FACT}\n`);
    case "md":
      return utf8(`# Native Markdown\n\nThe accepted fact is ${FACT}.\n`);
    case "csv":
      return utf8(`name,value\nretrieval,"${FACT}"\n`);
    case "json":
      return utf8(JSON.stringify({ retrieval: { fact: FACT } }, null, 2));
    case "yaml":
    case "yml":
      return utf8(`retrieval:\n  fact: ${FACT}\n`);
    case "xml":
      return utf8(`<knowledge><retrieval>${FACT}</retrieval></knowledge>`);
    case "html":
      return utf8(
        `<!doctype html><html><body><main><p>${FACT}</p><script>forbidden()</script></main></body></html>`,
      );
    case "srt":
      return utf8(`1\n00:00:00,000 --> 00:00:02,000\n${FACT}\n`);
    case "vtt":
      return utf8(`WEBVTT\n\n00:00.000 --> 00:02.000\n${FACT}\n`);
    case "ipynb":
      return utf8(
        JSON.stringify({
          nbformat: 4,
          nbformat_minor: 5,
          metadata: { language_info: { name: "python" } },
          cells: [
            {
              id: "fact-cell",
              cell_type: "code",
              metadata: {},
              source: [`fact = "${FACT}"\n`],
              outputs: [{ output_type: "stream", name: "stdout", text: [`${FACT}\n`] }],
              execution_count: 1,
            },
          ],
        }),
      );
    case "py":
      return utf8(`FACT = "${FACT}"\nprint(FACT)\n`);
    case "ts":
      return utf8(`export const fact: string = "${FACT}";\n`);
    case "js":
      return utf8(`export const fact = "${FACT}";\n`);
    case "java":
      return utf8(`final class Fact { static final String VALUE = "${FACT}"; }\n`);
    case "cpp":
      return utf8(`#include <string_view>\nconstexpr std::string_view fact = "${FACT}";\n`);
    case "go":
      return utf8(`package fixture\nconst Fact = "${FACT}"\n`);
    case "rs":
      return utf8(`pub const FACT: &str = "${FACT}";\n`);
    case "sql":
      return utf8(`SELECT '${FACT}' AS retrieval_fact;\n`);
  }
}

function stableProjection(input: { format: SourceNativeTextExtension; resultBytes: Uint8Array }) {
  const parse = async () => {
    const representation = await canonicalSourceRepresentation({
      provider: "native_text",
      format: input.format,
      bytes: input.resultBytes,
    });
    const projection = projectRepresentation({
      representationId: `acceptance:${input.format}`,
      blocks: representation.blocks,
      profile: knowledgeProfileV3,
    });
    return { representation, projection };
  };
  return Promise.all([parse(), parse()]);
}

async function main() {
  const results = [];
  for (const format of formats) {
    const source = await sourceBytes(format);
    const nativeResult = await parseNativeSourceFile(format, source);
    const resultBytes = utf8(JSON.stringify(nativeResult));
    const [left, right] = await stableProjection({ format, resultBytes });
    const leftHash = createHash("sha256").update(JSON.stringify(left)).digest("hex");
    const rightHash = createHash("sha256").update(JSON.stringify(right)).digest("hex");
    if (leftHash !== rightHash) throw new Error(`knowledge_format_identity_unstable:${format}`);
    const expectedUnit = left.projection.evidenceUnits.find((unit) =>
      unit.exactExcerpt?.includes(FACT),
    );
    if (!expectedUnit) {
      throw new Error(`knowledge_format_expected_evidence_missing:${format}`);
    }
    const locatorKinds = [
      ...new Set(left.projection.evidenceUnits.map((unit) => unit.locator.kind)),
    ];
    if (!locatorKinds.includes(expectedLocatorKinds[format])) {
      throw new Error(`knowledge_format_locator_invalid:${format}`);
    }
    const smoke = await runSingleDocumentKnowledgeSmoke({
      expectedEvidence: FACT,
      filename: `fixture.${format}`,
      mode: "offline",
      provider: "native_text",
      query: FACT,
      resultBytes,
      sourceSizeBytes: source.byteLength,
    });
    if (smoke.matchedEvidence.contentHash !== expectedUnit.contentHash) {
      throw new Error(`knowledge_format_content_hash_mismatch:${format}`);
    }
    results.push({
      format,
      sourceBytes: source.byteLength,
      resultBytes: resultBytes.byteLength,
      blockCount: left.projection.blocks.length,
      chunkCount: left.projection.chunks.length,
      evidenceCount: left.projection.evidenceUnits.length,
      locatorKinds,
      stable: true as const,
      retrieved: true as const,
      matchedExcerpt: smoke.matchedEvidence.excerpt,
    });
    console.log(`${format}: ok`);
  }
  const report = reportSchema.parse({
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    formats: results,
  });
  const runId = report.createdAt.toLowerCase().replaceAll(/[^0-9a-z]/g, "");
  const directory = path.resolve("test-results/knowledge-format-acceptance", runId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const table = report.formats
    .map(
      (item) =>
        `| ${item.format} | ${item.blockCount} | ${item.chunkCount} | ${item.evidenceCount} | ${item.locatorKinds.join(", ")} | pass |`,
    )
    .join("\n");
  await writeFile(
    path.join(directory, "report.md"),
    `# Native Knowledge Format Acceptance\n\n| Format | Blocks | Chunks | Evidence | Locator | Gate |\n| --- | ---: | ---: | ---: | --- | --- |\n${table}\n`,
  );
  console.log(JSON.stringify({ status: "ok", directory, formats: report.formats.length }));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "knowledge_format_acceptance_failed");
  process.exitCode = 1;
});
