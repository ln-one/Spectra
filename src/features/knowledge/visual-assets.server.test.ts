import { strToU8, zipSync } from "fflate";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  normalizeKnowledgeVisualImage,
  readKnowledgeVisualArchiveEntry,
} from "./visual-assets.server";

describe("Knowledge visual asset safety", () => {
  it("reads only the exact archive entry", async () => {
    const expected = strToU8("trusted image bytes");
    const archive = zipSync({
      "images/figure.png": expected,
      "images/other.png": strToU8("other"),
    });

    await expect(readKnowledgeVisualArchiveEntry(archive, "images/figure.png")).resolves.toEqual(
      expected,
    );
    await expect(readKnowledgeVisualArchiveEntry(archive, "images/missing.png")).rejects.toThrow(
      "knowledge_visual_archive_entry_missing",
    );
  });

  it("rejects archive traversal and ambiguous path segments", async () => {
    const archive = zipSync({ "images/figure.png": strToU8("image") });

    await expect(readKnowledgeVisualArchiveEntry(archive, "../figure.png")).rejects.toThrow(
      "knowledge_visual_archive_path_invalid",
    );
    await expect(readKnowledgeVisualArchiveEntry(archive, "images//figure.png")).rejects.toThrow(
      "knowledge_visual_archive_path_invalid",
    );
    await expect(readKnowledgeVisualArchiveEntry(archive, "/images/figure.png")).rejects.toThrow(
      "knowledge_visual_archive_path_invalid",
    );
  });

  it("rejects duplicate archive entries with the requested path", async () => {
    const archive = Buffer.from(
      zipSync({
        "images/a.png": strToU8("first"),
        "images/b.png": strToU8("second"),
      }),
    );
    const oldName = Buffer.from("images/b.png");
    const duplicateName = Buffer.from("images/a.png");
    let offset = archive.indexOf(oldName);
    while (offset >= 0) {
      duplicateName.copy(archive, offset);
      offset = archive.indexOf(oldName, offset + duplicateName.byteLength);
    }

    await expect(readKnowledgeVisualArchiveEntry(archive, "images/a.png")).rejects.toThrow(
      "knowledge_visual_archive_entry_invalid",
    );
  });

  it("decodes, bounds, rotates, and normalizes supported images to WebP", async () => {
    const input = await sharp({
      create: {
        background: "#123456",
        channels: 4,
        height: 1_200,
        width: 3_000,
      },
    })
      .png()
      .toBuffer();

    const output = await normalizeKnowledgeVisualImage(input);
    const metadata = await sharp(output.bytes).metadata();

    expect(output.mediaType).toBe("image/webp");
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(2_048);
    expect(metadata.height).toBeLessThanOrEqual(2_048);
  });

  it("rejects malformed and unsupported image payloads", async () => {
    await expect(normalizeKnowledgeVisualImage(strToU8("not an image"))).rejects.toThrow(
      "knowledge_visual_image_invalid",
    );
    await expect(
      normalizeKnowledgeVisualImage(
        strToU8('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'),
      ),
    ).rejects.toThrow("knowledge_visual_image_invalid");
  });
});
