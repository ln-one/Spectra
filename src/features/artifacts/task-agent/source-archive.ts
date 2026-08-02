import { gunzipSync, gzipSync } from "node:zlib";
import { extract, pack } from "tar-stream";

const MAX_SOURCE_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_SOURCE_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_SOURCE_FILES = 2_000;
const MAX_SOURCE_FILE_BYTES = 25 * 1024 * 1024;

export type TaskAgentArchiveFile = { body: Uint8Array; path: string };

type ArchiveOptions = {
  failurePrefix: "animation" | "presentation" | "task_agent";
};

function failure(options: ArchiveOptions, suffix: string, cause?: unknown) {
  return new Error(`${options.failurePrefix}_source_${suffix}`, { cause });
}

function safeArchivePath(value: string, options: ArchiveOptions) {
  const normalized = value.replace(/^\.\//, "").replace(/\\/g, "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes("\0") ||
    normalized.split("/").includes("..")
  ) {
    throw failure(options, "archive_unsafe");
  }
  return normalized;
}

export async function readTaskAgentSourceArchive(
  archive: Uint8Array,
  options: ArchiveOptions = { failurePrefix: "task_agent" },
): Promise<TaskAgentArchiveFile[]> {
  if (archive.byteLength === 0 || archive.byteLength > MAX_SOURCE_ARCHIVE_BYTES) {
    throw failure(options, "archive_size");
  }

  let tar: Buffer;
  try {
    tar = gunzipSync(archive, { maxOutputLength: MAX_SOURCE_UNCOMPRESSED_BYTES });
  } catch (error) {
    throw failure(options, "archive_invalid", error);
  }

  const parser = extract();
  const files: TaskAgentArchiveFile[] = [];
  let parseFailure: Error | null = null;
  parser.on("entry", (header, stream, next) => {
    try {
      const memberPath = safeArchivePath(header.name, options);
      if (header.type === "directory") {
        stream.resume();
        stream.once("end", next);
        return;
      }
      if (header.type !== "file") throw failure(options, "member_type");
      const declaredSize = header.size;
      if (
        !Number.isSafeInteger(declaredSize) ||
        declaredSize === undefined ||
        declaredSize < 0 ||
        declaredSize > MAX_SOURCE_FILE_BYTES
      ) {
        throw failure(options, "member_size");
      }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > MAX_SOURCE_FILE_BYTES) {
          parseFailure ??= failure(options, "member_size");
          stream.resume();
          return;
        }
        chunks.push(chunk);
      });
      stream.once("end", () => {
        if (!parseFailure) {
          files.push({ body: new Uint8Array(Buffer.concat(chunks)), path: memberPath });
          if (files.length > MAX_SOURCE_FILES) parseFailure = failure(options, "file_limit");
        }
        next();
      });
    } catch (error) {
      parseFailure = error instanceof Error ? error : failure(options, "archive_invalid", error);
      stream.resume();
      stream.once("end", next);
    }
  });

  await new Promise<void>((resolve, reject) => {
    parser.once("finish", resolve);
    parser.once("error", reject);
    parser.end(tar);
  }).catch((error: unknown) => {
    throw failure(options, "archive_invalid", error);
  });

  if (parseFailure) throw parseFailure;
  if (files.length === 0) throw failure(options, "empty");
  if (new Set(files.map((file) => file.path)).size !== files.length) {
    throw failure(options, "path_conflict");
  }
  return files;
}

export async function deterministicTaskAgentSourceArchive(
  files: readonly TaskAgentArchiveFile[],
  options: ArchiveOptions = { failurePrefix: "task_agent" },
) {
  const normalized = files
    .map((file) => ({
      body: file.body,
      path: safeArchivePath(file.path.startsWith("out/") ? file.path : `out/${file.path}`, options),
    }))
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
  if (normalized.length === 0) throw failure(options, "empty");
  if (normalized.length > MAX_SOURCE_FILES) throw failure(options, "file_limit");
  if (new Set(normalized.map((file) => file.path)).size !== normalized.length) {
    throw failure(options, "path_conflict");
  }

  const archive = pack();
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.once("end", () => resolve(Buffer.concat(chunks)));
    archive.once("error", reject);
  });
  for (const file of normalized) {
    if (file.body.byteLength > MAX_SOURCE_FILE_BYTES) throw failure(options, "member_size");
    archive.entry(
      {
        mode: 0o644,
        mtime: new Date(0),
        name: file.path,
        size: file.body.byteLength,
        type: "file",
      },
      Buffer.from(file.body),
    );
  }
  archive.finalize();
  const tar = await completed;
  if (tar.byteLength > MAX_SOURCE_UNCOMPRESSED_BYTES) throw failure(options, "archive_size");
  const compressed = gzipSync(tar, { level: 9 });
  if (compressed.byteLength > MAX_SOURCE_ARCHIVE_BYTES) throw failure(options, "archive_size");
  return new Uint8Array(compressed);
}
