import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { knowledgeProfileV3 } from "../../src/features/knowledge/profile";
import { projectRepresentation } from "../../src/features/knowledge/projection";
import { canonicalSourceRepresentation } from "../../src/features/knowledge/source-result";
import {
  sourceAudioAnalysis,
  sourceVideoAnalysis,
} from "../../src/features/sources/ingestion/media-result";
import {
  analyzeMedia,
  type MediaUnderstandingResult,
} from "../../src/features/sources/ingestion/media-understanding";
import type {
  SourceAudioExtension,
  SourceVideoExtension,
} from "../../src/features/sources/validation";
import { runSingleDocumentKnowledgeSmoke } from "../knowledge-acceptance/runner";

const SENTINEL_QUERY = "Spectra media fact four two";
const audioFormats = ["mp3", "wav", "aac"] as const satisfies readonly SourceAudioExtension[];
const videoFormats = [
  "mp4",
  "mov",
  "mkv",
  "avi",
  "flv",
  "wmv",
] as const satisfies readonly SourceVideoExtension[];
const formats = [...audioFormats, ...videoFormats] as const;
type MediaFormat = (typeof formats)[number];
type Mode = "offline" | "live";

const fixtureHashes: Record<MediaFormat, string> = {
  aac: "488510c88ca19e6fbd8cb83cfba53afaeea7b173a1d6357ae2e515adf6d738df",
  avi: "49656bb35f3cbd895cbdf9baa1ed647e464d7197296f4f3ea747d6cd9335bdf2",
  flv: "03ab1cff7ddf2fb2fdb5eb986d2b1ae6d8b2491e9f8a3abc92b98c82d9f88be9",
  mkv: "e9ea712a22a3e12127862bfdca6d9c20bf0c5c3bb2aa7e651260dac9a8625bff",
  mov: "935b0cb1c74be27cc1731422c841ec6a3c86339d5f641a4d9b4c557be45d48df",
  mp3: "07bb41365302c2bcc75ae1ca38267648fc777aff827b92f797ee94d574540b64",
  mp4: "8fdba0a1277e65fe826623bec2762b8da957d358e81401f4657c36a54e858ded",
  wav: "17cad6689a6194911659b1d772ae65e3f57c4936b9a8587bc8bb3341a21316fd",
  wmv: "e582b529461a484aa6f3fe9edc1fcdba9da20240f8f007d4d8a3f79d0bdfc388",
};

const fixtureMediaTypes: Record<MediaFormat, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  aac: "audio/aac",
  mp4: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  flv: "video/x-flv",
  wmv: "video/x-ms-wmv",
};

const reportSchema = z
  .object({
    schemaVersion: z.literal(1),
    mode: z.enum(["offline", "live"]),
    createdAt: z.string(),
    formats: z.array(
      z
        .object({
          format: z.enum(formats),
          providerAccepted: z.literal(true),
          segmentCount: z.number().int().positive(),
          blockCount: z.number().int().positive(),
          chunkCount: z.number().int().positive(),
          evidenceCount: z.number().int().positive(),
          locatorKinds: z.array(z.literal("media_range")).min(1),
          stable: z.literal(true),
          retrieved: z.literal(true),
          matchedExcerpt: z.string().min(1),
          resultSha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    ),
  })
  .strict();

function modeFromArguments(): Mode {
  const value = process.argv.find((argument) => argument.startsWith("--mode="))?.slice(7);
  if (value === "offline" || value === "live") return value;
  throw new Error("knowledge_media_acceptance_mode_required");
}

function formatsFromArguments(): readonly MediaFormat[] {
  const value = process.argv.find((argument) => argument.startsWith("--formats="))?.slice(10);
  if (!value) return formats;
  const requested = value.split(",");
  if (
    requested.length === 0 ||
    new Set(requested).size !== requested.length ||
    requested.some((format) => !formats.includes(format as MediaFormat))
  ) {
    throw new Error("knowledge_media_acceptance_format_invalid");
  }
  return requested as MediaFormat[];
}

function isAudio(format: MediaFormat): format is SourceAudioExtension {
  return audioFormats.some((candidate) => candidate === format);
}

function fixtureResult(): MediaUnderstandingResult {
  return {
    summary: `Media acceptance fixture containing ${SENTINEL_QUERY}.`,
    segments: [{ startMs: 0, endMs: 2_000, description: SENTINEL_QUERY }],
    usage: {},
  };
}

function containsSentinel(result: MediaUnderstandingResult) {
  const normalized = [result.summary, ...result.segments.map((segment) => segment.description)]
    .join(" ")
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ");
  return (
    normalized.includes("spectra") &&
    normalized.includes("media") &&
    normalized.includes("fact") &&
    (normalized.includes("42") || (normalized.includes("four") && normalized.includes("two")))
  );
}

async function providerResult(format: MediaFormat, mode: Mode): Promise<MediaUnderstandingResult> {
  if (mode === "offline") return fixtureResult();
  const bytes = await readFile(
    path.resolve("scripts/knowledge-format-acceptance/fixtures/media", `sentinel.${format}`),
  );
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== fixtureHashes[format]) {
    throw new Error(`knowledge_media_fixture_hash_mismatch:${format}`);
  }
  const url = `data:${fixtureMediaTypes[format]};base64,${bytes.toString("base64")}`;
  return isAudio(format)
    ? analyzeMedia({ kind: "audio", format, url })
    : analyzeMedia({ kind: "video", url });
}

function storedResult(format: MediaFormat, result: MediaUnderstandingResult) {
  return isAudio(format)
    ? sourceAudioAnalysis(format, result)
    : sourceVideoAnalysis(format, result);
}

async function stableProjection(format: MediaFormat, resultBytes: Uint8Array) {
  const parse = async () => {
    const representation = await canonicalSourceRepresentation({
      provider: "media_understanding",
      format,
      bytes: resultBytes,
    });
    const projection = projectRepresentation({
      representationId: `acceptance:${format}`,
      blocks: representation.blocks,
      profile: knowledgeProfileV3,
    });
    return { representation, projection };
  };
  return Promise.all([parse(), parse()]);
}

async function main() {
  const mode = modeFromArguments();
  const selectedFormats = formatsFromArguments();
  const results = [];
  for (const format of selectedFormats) {
    const analysis = await providerResult(format, mode);
    if (!containsSentinel(analysis)) {
      throw new Error(`knowledge_media_sentinel_missing:${format}`);
    }
    const resultBytes = new TextEncoder().encode(JSON.stringify(storedResult(format, analysis)));
    const [left, right] = await stableProjection(format, resultBytes);
    const leftHash = createHash("sha256").update(JSON.stringify(left)).digest("hex");
    const rightHash = createHash("sha256").update(JSON.stringify(right)).digest("hex");
    if (leftHash !== rightHash) throw new Error(`knowledge_media_identity_unstable:${format}`);
    const expectedEvidence = analysis.segments[0]?.description;
    if (!expectedEvidence) throw new Error(`knowledge_media_segment_missing:${format}`);
    const locatorKinds = [
      ...new Set(left.projection.evidenceUnits.map((unit) => unit.locator.kind)),
    ];
    if (locatorKinds.length !== 1 || locatorKinds[0] !== "media_range") {
      throw new Error(`knowledge_media_locator_invalid:${format}`);
    }
    const expectedUnit = left.projection.evidenceUnits.find(
      (unit) => unit.exactExcerpt === expectedEvidence,
    );
    if (!expectedUnit) throw new Error(`knowledge_media_expected_evidence_missing:${format}`);
    const smoke = await runSingleDocumentKnowledgeSmoke({
      expectedEvidence,
      filename: `fixture.${format}`,
      mode,
      provider: "media_understanding",
      query: SENTINEL_QUERY,
      resultBytes,
      sourceSizeBytes: resultBytes.byteLength,
    });
    if (smoke.matchedEvidence.contentHash !== expectedUnit.contentHash) {
      throw new Error(`knowledge_media_content_hash_mismatch:${format}`);
    }
    results.push({
      format,
      providerAccepted: true as const,
      segmentCount: analysis.segments.length,
      blockCount: left.projection.blocks.length,
      chunkCount: left.projection.chunks.length,
      evidenceCount: left.projection.evidenceUnits.length,
      locatorKinds: ["media_range" as const],
      stable: true as const,
      retrieved: true as const,
      matchedExcerpt: smoke.matchedEvidence.excerpt,
      resultSha256: createHash("sha256").update(resultBytes).digest("hex"),
    });
    console.log(`${format}: ok`);
  }
  const report = reportSchema.parse({
    schemaVersion: 1,
    mode,
    createdAt: new Date().toISOString(),
    formats: results,
  });
  const runId = `${mode}-${report.createdAt.toLowerCase().replaceAll(/[^0-9a-z]/g, "")}`;
  const directory = path.resolve("test-results/knowledge-format-acceptance", runId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const table = report.formats
    .map(
      (item) =>
        `| ${item.format} | ${item.segmentCount} | ${item.blockCount} | ${item.chunkCount} | ${item.evidenceCount} | pass |`,
    )
    .join("\n");
  await writeFile(
    path.join(directory, "report.md"),
    `# Media Knowledge Format Acceptance (${mode})\n\n| Format | Segments | Blocks | Chunks | Evidence | Gate |\n| --- | ---: | ---: | ---: | ---: | --- |\n${table}\n`,
  );
  console.log(JSON.stringify({ status: "ok", directory, formats: report.formats.length }));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "knowledge_media_acceptance_failed");
  process.exitCode = 1;
});
