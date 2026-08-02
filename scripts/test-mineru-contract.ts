import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectsCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import * as nextEnv from "@next/env";
import { MinerU, MinerUError } from "mineru-open-sdk";
import { z } from "zod";
import { mineruEnvironment, mineruProcessingProfile } from "@/features/sources/ingestion/config";

nextEnv.loadEnvConfig(process.cwd());

const MAX_POLL_WINDOW_MS = 10 * 60 * 1_000;
const POLL_INTERVAL_MS = 5_000;
const fixturePath = resolve(
  process.env.MINERU_CONTRACT_FIXTURE ?? "tests/fixtures/mineru-contract.png",
);
let contractStage = "startup";

const mineruResultSchema = z.object({
  state: z.string().regex(/^[a-z][a-z_-]{0,31}$/),
  zipUrl: z.url().startsWith("https://").nullable(),
  markdown: z.string().nullable(),
  contentList: z.array(z.record(z.string(), z.unknown())).nullable(),
  _zipBytes: z.instanceof(Uint8Array).nullable(),
});

function summarizeContentList(contentList: Array<Record<string, unknown>> | null) {
  if (!contentList) return null;
  const typeCounts: Record<string, number> = {};
  let withPageIndex = 0;
  let withBoundingBox = 0;
  for (const item of contentList) {
    const type = typeof item.type === "string" ? item.type : "unknown";
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    if (Number.isInteger(item.page_idx)) withPageIndex += 1;
    if (
      Array.isArray(item.bbox) &&
      item.bbox.length === 4 &&
      item.bbox.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    ) {
      withBoundingBox += 1;
    }
  }
  return { itemCount: contentList.length, typeCounts, withPageIndex, withBoundingBox };
}

function assertLoopbackEndpoint(endpoint: string) {
  const hostname = new URL(endpoint).hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "[::1]") {
    throw new Error("The MinerU contract may only read and write local object storage.");
  }
}

async function deleteContractPrefix(client: S3Client, bucket: string, prefix: string) {
  for (;;) {
    const listed = await client.send(
      new ListObjectVersionsCommand({ Bucket: bucket, Prefix: prefix }),
    );
    const objects = [
      ...(listed.Versions ?? []).map(({ Key, VersionId }) => ({ Key, VersionId })),
      ...(listed.DeleteMarkers ?? []).map(({ Key, VersionId }) => ({ Key, VersionId })),
    ].filter((object): object is { Key: string; VersionId: string } =>
      Boolean(object.Key && object.VersionId),
    );
    if (objects.length === 0) return;

    const deleted = await client.send(
      new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }),
    );
    if ((deleted.Errors?.length ?? 0) > 0) {
      throw new Error("Object storage rejected MinerU contract cleanup.");
    }
  }
}

function assertVersionId(versionId: string | undefined, operation: string): string {
  if (!versionId) {
    throw new Error(`${operation} did not return a version ID.`);
  }
  return versionId;
}

function safeErrorCategory(error: unknown) {
  if (error instanceof MinerUError) return `${error.name}:${error.code}`;
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    const path = issue?.path
      .map((part) =>
        String(part)
          .toLowerCase()
          .replaceAll(/[^a-z0-9_]/g, "_"),
      )
      .join(":");
    const keys =
      issue && "keys" in issue && Array.isArray(issue.keys)
        ? issue.keys
            .map((key) =>
              String(key)
                .toLowerCase()
                .replaceAll(/[^a-z0-9_]/g, "_"),
            )
            .join(":")
        : "";
    return ["invalid_provider_result", issue?.code, path, keys].filter(Boolean).join(":");
  }
  if (error instanceof Error) {
    if (/^knowledge_[a-z0-9_:-]+$/.test(error.message)) return error.message;
    const httpStatus = /^(?:HTTP|Upload failed:|Download failed:) (\d{3})\b/.exec(
      error.message,
    )?.[1];
    if (httpStatus) return `http_${httpStatus}`;
    return error.name;
  }
  return "unknown_error";
}

async function waitForResult(mineru: MinerU, batchId: string) {
  const deadline = Date.now() + MAX_POLL_WINDOW_MS;
  const observedStates = new Set<string>();

  while (Date.now() < deadline) {
    const results = await mineru.getBatch(batchId);
    if (results.length !== 1) {
      throw new Error(`Expected one MinerU result, received ${results.length}.`);
    }

    const result = mineruResultSchema.parse(results[0]);
    observedStates.add(result.state);
    if (result.state === "failed") {
      throw new Error("MinerU reported a failed task.");
    }
    if (result.state === "done") {
      return { result, observedStates: [...observedStates] };
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, POLL_INTERVAL_MS));
  }

  throw new Error("MinerU did not finish within the 10 minute polling window.");
}

async function main(token: string) {
  const [{ createStorageClient }, { storageConfig }] = await Promise.all([
    import("../src/storage/client"),
    import("../src/storage/config"),
  ]);
  const config = storageConfig();
  assertLoopbackEndpoint(config.endpoint);

  const client = createStorageClient(config);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "spectra-mineru-"));
  const extension = extname(fixturePath).toLowerCase() || ".bin";
  const temporarySourcePath = join(temporaryDirectory, `source${extension}`);
  const runId = crypto.randomUUID();
  const prefix = `contracts/mineru/${runId}`;
  let cleanupFailed = false;
  let summary:
    | {
        contract: string;
        sourceBytes: number;
        resultZipBytes: number;
        observedStates: string[];
        hasMarkdown: boolean;
        hasContentList: boolean;
        contentListSummary: ReturnType<typeof summarizeContentList>;
        representation: {
          adapterId: string;
          adapterVersion: string;
          blockCount: number;
          indexedBlockCount: number;
          metadata: Record<string, unknown> | null;
        };
        maxRssMiB: number;
        knowledge?: {
          candidateCount: number;
          evidenceCount: number;
          matchedEvidence: {
            sourceName?: string;
            excerpt: string | null;
            locator: import("../src/features/knowledge/contracts").EvidenceLocator;
            contentHash: string;
          };
        };
      }
    | undefined;

  try {
    contractStage = "storage_versioning";
    const versioning = await client.send(new GetBucketVersioningCommand({ Bucket: config.bucket }));
    if (versioning.Status !== "Enabled") {
      throw new Error("The local contract bucket must have versioning enabled.");
    }

    const sourceKey = `${prefix}/source${extension}`;
    contractStage = "source_upload";
    const sourceUpload = await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: sourceKey,
        Body: createReadStream(fixturePath),
        ContentType:
          extension === ".pdf"
            ? "application/pdf"
            : extension === ".png"
              ? "image/png"
              : "application/octet-stream",
      }),
    );
    const sourceObject = {
      key: sourceKey,
      versionId: assertVersionId(sourceUpload.VersionId, "Source upload"),
    };
    contractStage = "source_download";
    const sourceDownload = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: sourceObject.key,
        VersionId: sourceObject.versionId,
      }),
    );
    if (!sourceDownload.Body) {
      throw new Error("Source download returned no body.");
    }
    await pipeline(
      sourceDownload.Body.transformToWebStream(),
      createWriteStream(temporarySourcePath),
    );

    const mineru = new MinerU(token);
    mineru.setSource("spectra-contract");
    contractStage = "mineru_submit";
    const batchId = await mineru.submit(temporarySourcePath, {
      ...mineruProcessingProfile,
      fileParams: {
        [temporarySourcePath]: { dataId: runId },
      },
    });
    if (!batchId) {
      throw new Error("MinerU submit returned no batch ID.");
    }

    contractStage = "mineru_poll";
    const { result, observedStates } = await waitForResult(mineru, batchId);
    contractStage = "result_validate";
    if (!result.zipUrl || !result._zipBytes || result._zipBytes.byteLength === 0) {
      throw new Error("Completed MinerU result did not include a result ZIP.");
    }
    if (result._zipBytes[0] !== 0x50 || result._zipBytes[1] !== 0x4b) {
      throw new Error("MinerU result did not have a ZIP signature.");
    }
    const { canonicalSourceRepresentation } = await import(
      "../src/features/knowledge/source-result"
    );
    const { sourceFileExtension } = await import("../src/features/sources/validation");
    const format = sourceFileExtension(basename(fixturePath));
    if (!format) throw new Error("knowledge_source_format_invalid");
    const representation = await canonicalSourceRepresentation({
      provider: "mineru",
      format,
      bytes: result._zipBytes,
    });

    const knowledgeQuery = process.env.KNOWLEDGE_DOCUMENT_SMOKE_QUERY?.trim();
    const expectedEvidence = process.env.KNOWLEDGE_DOCUMENT_SMOKE_EXPECTED?.trim();
    if (Boolean(knowledgeQuery) !== Boolean(expectedEvidence)) {
      throw new Error("Knowledge document smoke requires both Query and expected Evidence.");
    }
    let knowledge: Awaited<
      ReturnType<typeof import("./knowledge-acceptance/runner").runSingleDocumentKnowledgeSmoke>
    > | null = null;
    if (knowledgeQuery && expectedEvidence) {
      contractStage = "knowledge_smoke";
      const { runSingleDocumentKnowledgeSmoke } = await import("./knowledge-acceptance/runner");
      knowledge = await runSingleDocumentKnowledgeSmoke({
        expectedEvidence,
        filename: basename(fixturePath),
        mode: "live",
        query: knowledgeQuery,
        resultBytes: result._zipBytes,
        sourceSizeBytes: (await stat(temporarySourcePath)).size,
      });
    }

    const resultKey = `${prefix}/result.zip`;
    contractStage = "result_archive";
    const resultUpload = await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: resultKey,
        Body: result._zipBytes,
        ContentLength: result._zipBytes.byteLength,
        ContentType: "application/zip",
      }),
    );
    const resultObject = {
      key: resultKey,
      versionId: assertVersionId(resultUpload.VersionId, "Result archive"),
    };
    const archivedResult = await client.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: resultObject.key,
        VersionId: resultObject.versionId,
      }),
    );
    if (archivedResult.ContentLength !== result._zipBytes.byteLength) {
      throw new Error("Archived MinerU result size did not match the SDK result.");
    }

    const sourceBytes = (await stat(temporarySourcePath)).size;
    const maxRssMiB = Math.round(process.resourceUsage().maxRSS / 1024);
    summary = {
      contract: "mineru-open-sdk@0.2.5",
      sourceBytes,
      resultZipBytes: result._zipBytes.byteLength,
      observedStates,
      hasMarkdown: result.markdown !== null,
      hasContentList: result.contentList !== null,
      contentListSummary: summarizeContentList(result.contentList),
      representation: {
        adapterId: representation.adapterId,
        adapterVersion: representation.adapterVersion,
        blockCount: representation.blocks.length,
        indexedBlockCount: representation.blocks.filter((block) => block.indexText !== null).length,
        metadata: representation.metadata ?? null,
      },
      maxRssMiB,
      ...(knowledge
        ? {
            knowledge: {
              candidateCount: knowledge.candidateCount,
              evidenceCount: knowledge.evidenceCount,
              matchedEvidence: knowledge.matchedEvidence,
            },
          }
        : {}),
    };
    contractStage = "complete";
  } finally {
    const objectsRemoved = await deleteContractPrefix(client, config.bucket, prefix)
      .then(() => true)
      .catch(() => false);
    client.destroy();
    const temporaryFilesRemoved = await rm(temporaryDirectory, { recursive: true, force: true })
      .then(() => true)
      .catch(() => false);
    cleanupFailed = !objectsRemoved || !temporaryFilesRemoved;
    if (cleanupFailed) {
      console.error(
        "MinerU contract cleanup failed; random contract objects or temporary files may remain.",
      );
    }
  }

  if (cleanupFailed) {
    contractStage = "cleanup";
    throw new Error("MinerU contract object cleanup failed.");
  }
  if (!summary) {
    throw new Error("MinerU contract produced no result summary.");
  }
  console.log(JSON.stringify(summary));
}

let token: string | null = null;
try {
  token = mineruEnvironment().apiToken;
} catch {
  console.error(
    "MinerU contract stopped: MINERU_API_TOKEN is required because this command uses the real provider and consumes quota.",
  );
  process.exitCode = 1;
}
if (token) {
  void main(token).catch((error: unknown) => {
    const category = safeErrorCategory(error);
    console.error(
      `MinerU contract failed during ${contractStage} (${category}). No credentials or provider URLs were logged.`,
    );
    process.exitCode = 1;
  });
}
