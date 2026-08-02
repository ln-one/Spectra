import { describe, expect, test } from "vitest";
import {
  isSourceIngestionProvider,
  isSourceNativeTextExtension,
  MAX_NATIVE_TEXT_SOURCE_FILE_BYTES,
  MAX_SOURCE_FILE_BYTES,
  SOURCE_FILE_EXTENSIONS,
  SOURCE_FORMAT_REGISTRY,
  SOURCE_INGESTION_PROVIDERS,
  SOURCE_NATIVE_TEXT_EXTENSIONS,
  sourceFileExtension,
  sourceFileMaxBytes,
  sourceIngestionProvider,
  sourceMediaKind,
  sourceUploadIntentSchema,
} from "./validation";

describe("source upload intent", () => {
  test("owns the exact supported extension contract", () => {
    expect(SOURCE_FILE_EXTENSIONS).toEqual([
      "pdf",
      "docx",
      "pptx",
      "xlsx",
      "txt",
      "md",
      "csv",
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
      "png",
      "jpg",
      "jpeg",
      "mp3",
      "wav",
      "aac",
      "mp4",
      "mov",
      "mkv",
      "avi",
      "flv",
      "wmv",
    ]);
    expect(sourceFileExtension("LESSON.PDF")).toBe("pdf");
    expect(sourceFileExtension("archive.tar.pdf")).toBe("pdf");
    expect(sourceFileExtension("notes.txt")).toBe("txt");
    expect(sourceFileExtension("pdf")).toBeNull();
    expect(sourceIngestionProvider("lesson.pdf")).toBe("mineru");
    expect(sourceIngestionProvider("recording.MP3")).toBe("media_understanding");
    expect(sourceIngestionProvider("lecture.MP4")).toBe("media_understanding");
    expect(sourceIngestionProvider("notes.txt")).toBe("native_text");
    expect(sourceIngestionProvider("settings.YML")).toBe("native_text");
    expect(sourceMediaKind("recording.mp3")).toBe("audio");
    expect(sourceMediaKind("lecture.MOV")).toBe("video");
    expect(sourceMediaKind("notes.md")).toBeNull();
    expect(sourceFileMaxBytes("notes.csv")).toBe(MAX_NATIVE_TEXT_SOURCE_FILE_BYTES);
    expect(sourceFileMaxBytes("sheet.xlsx")).toBe(MAX_SOURCE_FILE_BYTES);
    expect(sourceFileMaxBytes("archive.zip")).toBeNull();
    expect(SOURCE_NATIVE_TEXT_EXTENSIONS).toEqual([
      "xlsx",
      "txt",
      "md",
      "csv",
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
    ]);
    expect(isSourceNativeTextExtension(sourceFileExtension("notebook.ipynb"))).toBe(true);
    expect(isSourceNativeTextExtension(sourceFileExtension("lesson.pdf"))).toBe(false);
    expect(SOURCE_INGESTION_PROVIDERS).toEqual(["mineru", "media_understanding", "native_text"]);
    expect(isSourceIngestionProvider("native_text")).toBe(true);
    expect(isSourceIngestionProvider("unknown")).toBe(false);
    expect(Object.keys(SOURCE_FORMAT_REGISTRY)).toHaveLength(35);
    expect(
      Object.values(SOURCE_FORMAT_REGISTRY).every(
        (policy) =>
          policy.capabilities.ingest &&
          policy.capabilities.project &&
          policy.capabilities.retrieve &&
          policy.capabilities.nativeLocator &&
          !policy.capabilities.preview,
      ),
    ).toBe(true);
  });

  test.each([
    "notes.pdf",
    "lesson.DOCX",
    "slides.pptx",
    "data.xlsx",
    "notes.txt",
    "readme.md",
    "grades.csv",
    "data.json",
    "settings.yaml",
    "workflow.yml",
    "document.xml",
    "page.html",
    "captions.srt",
    "captions.vtt",
    "analysis.ipynb",
    "script.py",
    "types.ts",
    "browser.js",
    "Main.java",
    "program.cpp",
    "server.go",
    "library.rs",
    "query.sql",
    "image.png",
    "photo.jpg",
    "scan.jpeg",
    "recording.mp3",
    "interview.wav",
    "voice.aac",
    "lecture.mp4",
    "lecture.mov",
    "lecture.mkv",
    "lecture.avi",
    "lecture.flv",
    "lecture.wmv",
  ])("accepts the supported extension in %s", (originalFilename) => {
    expect(sourceUploadIntentSchema.parse({ originalFilename, declaredSizeBytes: 1 })).toEqual({
      originalFilename,
      declaredSizeBytes: 1,
    });
  });

  test("normalizes surrounding filename whitespace and accepts the exact size limit", () => {
    expect(
      sourceUploadIntentSchema.parse({
        originalFilename: "  lesson.pdf  ",
        declaredSizeBytes: MAX_SOURCE_FILE_BYTES,
      }),
    ).toEqual({ originalFilename: "lesson.pdf", declaredSizeBytes: MAX_SOURCE_FILE_BYTES });
  });

  test.each([
    {
      originalFilename: "notes.txt",
      declaredSizeBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES + 1,
    },
    { originalFilename: "notes.zip", declaredSizeBytes: 1 },
    { originalFilename: "folder/notes.pdf", declaredSizeBytes: 1 },
    { originalFilename: "folder\\notes.pdf", declaredSizeBytes: 1 },
    { originalFilename: "notes\u0000.pdf", declaredSizeBytes: 1 },
    { originalFilename: "notes\u0085.pdf", declaredSizeBytes: 1 },
    { originalFilename: `${"😀".repeat(252)}.pdf`, declaredSizeBytes: 1 },
    { originalFilename: "notes.pdf", declaredSizeBytes: 0 },
    { originalFilename: "notes.pdf", declaredSizeBytes: MAX_SOURCE_FILE_BYTES + 1 },
  ])("rejects an invalid upload intent %#", (input) => {
    expect(sourceUploadIntentSchema.safeParse(input).success).toBe(false);
  });

  test("counts Unicode code points consistently with PostgreSQL", () => {
    const originalFilename = `${"😀".repeat(251)}.pdf`;
    expect(sourceUploadIntentSchema.parse({ originalFilename, declaredSizeBytes: 1 })).toEqual({
      originalFilename,
      declaredSizeBytes: 1,
    });
  });

  test.each([
    "ownerId",
    "workspaceId",
    "storageKey",
    "state",
    "unexpected",
  ])("rejects the protected or unknown field %s", (field) => {
    expect(
      sourceUploadIntentSchema.safeParse({
        originalFilename: "notes.pdf",
        declaredSizeBytes: 1,
        [field]: "forged",
      }).success,
    ).toBe(false);
  });
});
