import { describe, expect, test } from "vitest";
import { deterministicTaskAgentSourceArchive } from "../task-agent/source-archive";
import { inspectAnimationSourceArchive } from "./pipeline.server";

const fixtureProjectFiles = [
  { path: "package.json", source: "{}" },
  { path: "package-lock.json", source: "{}" },
  { path: "tsconfig.json", source: "{}" },
  { path: "src/index.ts", source: "export {};" },
  { path: "src/Root.tsx", source: "export const Root = () => null;" },
  { path: "src/Animation.tsx", source: "export const Animation = () => null;" },
] as const;

async function fixtureArchive(extraFiles: Array<{ body: Uint8Array; path: string }> = []) {
  return deterministicTaskAgentSourceArchive(
    [
      ...fixtureProjectFiles.map((file) => ({
        body: new TextEncoder().encode(file.source),
        path: `out/project/${file.path}`,
      })),
      ...extraFiles,
    ],
    { failurePrefix: "animation" },
  );
}

describe("animation source pipeline", () => {
  test("accepts a native renderable Remotion project without sidecar metadata", async () => {
    const inspected = await inspectAnimationSourceArchive(await fixtureArchive());
    expect(inspected.projectFiles).toHaveLength(6);
  });

  test("allows OpenHands to change project files and add local assets", async () => {
    const inspected = await inspectAnimationSourceArchive(
      await fixtureArchive([
        {
          body: new Uint8Array([1, 2, 3]),
          path: "out/project/public/assets/illustration.png",
        },
      ]),
    );
    expect(inspected.projectFiles.some((file) => file.path.endsWith("illustration.png"))).toBe(
      true,
    );
  });

  test("requires project source", async () => {
    const archive = await deterministicTaskAgentSourceArchive(
      [
        {
          body: new TextEncoder().encode("{}"),
          path: "out/unrelated.json",
        },
      ],
      { failurePrefix: "animation" },
    );
    await expect(inspectAnimationSourceArchive(archive)).rejects.toThrow(
      "animation_project_missing",
    );
  });
});
