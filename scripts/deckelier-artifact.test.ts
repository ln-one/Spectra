import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const artifactRoot = path.resolve(import.meta.dirname, "../public/deckelier");

function artifactFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? artifactFiles(target) : [target];
  });
}

function artifactDigest(files: string[]) {
  const digest = createHash("sha256");
  for (const file of files.filter((candidate) => !candidate.endsWith("/release.json")).sort()) {
    const relativePath = path.relative(artifactRoot, file);
    const fileDigest = createHash("sha256").update(readFileSync(file)).digest("hex");
    digest.update(`${relativePath}\0${fileDigest}\n`);
  }
  return digest.digest("hex");
}

describe("prebuilt Deckelier artifact", () => {
  test("contains no source files, maps, or local build paths", () => {
    const files = artifactFiles(artifactRoot);
    expect(files.some((file) => file.endsWith("/index.html"))).toBe(true);
    expect(files.filter((file) => /\.(?:map|ts|tsx)$/.test(file))).toEqual([]);

    for (const file of files.filter((candidate) => /\.(?:css|html|js)$/.test(candidate))) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toContain("sourceMappingURL");
      expect(content).not.toContain("packages/deckelier/src");
      expect(content).not.toContain("/Users/");
    }
  });

  test("contains the versioned cross-origin load-status protocol", () => {
    const script = artifactFiles(artifactRoot).find((file) => file.endsWith(".js"));
    expect(script).toBeDefined();
    const content = readFileSync(script ?? "", "utf8");

    expect(content).toContain("DECKELIER_LOAD_STATUS");
    expect(content).toContain("deckelier_parent_origin_invalid");
    expect(content).toMatch(/postMessage\(\{status:\w+,type:\w+,version:1\},\w+\)/);
  });

  test("records the immutable source revision and artifact digest", () => {
    const files = artifactFiles(artifactRoot);
    const manifest: unknown = JSON.parse(
      readFileSync(path.join(artifactRoot, "release.json"), "utf8"),
    );
    expect(manifest).toEqual({
      artifactSha256: artifactDigest(files),
      deckelierVersion: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      protocolVersion: 1,
      sourceRevision: expect.stringMatching(/^[0-9a-f]{12}$/),
    });
  });
});
