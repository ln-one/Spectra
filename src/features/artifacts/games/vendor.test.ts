import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

type VendorManifest = {
  megacrash: { curatedAssetsSha256: Record<string, string> };
  sidequest: { snapshotSpriteSha256: string };
};

async function sha256(filePath: string) {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

describe("flap revival vendor evidence", () => {
  it("matches the pinned upstream sprite and every curated CC0 asset", async () => {
    const repositoryRoot = process.cwd();
    const manifestPath = path.join(
      repositoryRoot,
      "src/features/artifacts/games/vendor/manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as VendorManifest;

    expect(
      await sha256(
        path.join(repositoryRoot, "src/features/artifacts/games/vendor/sidequest/spritesheet.png"),
      ),
    ).toBe(manifest.sidequest.snapshotSpriteSha256);

    for (const [filename, expectedHash] of Object.entries(manifest.megacrash.curatedAssetsSha256)) {
      expect(expectedHash).toMatch(/^[a-f0-9]{64}$/);
      expect(
        await sha256(path.join(repositoryRoot, "public/game-assets/flap-revival", filename)),
      ).toBe(expectedHash);
    }
  });
});
