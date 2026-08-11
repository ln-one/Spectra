import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { applicationEnvironmentKeys } from "./server";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    if (!entry.name.match(/\.[cm]?[jt]sx?$/) || entry.name.includes(".test.")) return [];
    return [absolute];
  });
}

describe("environment architecture", () => {
  test("keeps direct process.env access at explicit runtime boundaries", () => {
    const allowed = new Map<string, readonly string[]>([
      ["src/environment/client.ts", ["process.env.NEXT_PUBLIC_DECKELIER_URL"]],
      ["src/environment/server.ts", ["process.env"]],
      ["src/instrumentation.ts", ["process.env.NEXT_RUNTIME", "process.env.NEXT_RUNTIME"]],
      [
        "src/features/artifacts/animations/pipeline.server.ts",
        [
          "process.env.HTTP_PROXY",
          "process.env.HTTPS_PROXY",
          "process.env.NO_PROXY",
          "process.env.PATH",
          "process.env.HTTP_PROXY",
          "process.env.HTTPS_PROXY",
          "process.env.NO_PROXY",
          "process.env.PATH",
        ],
      ],
    ]);
    const violations: string[] = [];
    for (const absolute of sourceFiles(path.join(repositoryRoot, "src"))) {
      const relative = path.relative(repositoryRoot, absolute);
      let source = readFileSync(absolute, "utf8");
      for (const occurrence of allowed.get(relative) ?? []) {
        source = source.replace(occurrence, "");
      }
      if (source.includes("process.env")) violations.push(relative);
    }
    expect(violations).toEqual([]);
  });

  test("keeps the human template complete and duplicate-free", () => {
    const lines = readFileSync(path.join(repositoryRoot, ".env.example"), "utf8").split(/\r?\n/);
    const keys = lines.flatMap((line) => {
      const match = /^([A-Z_][A-Z0-9_]*)=/.exec(line);
      return match?.[1] ? [match[1]] : [];
    });
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    const missing = applicationEnvironmentKeys.filter(
      (key) => key !== "NODE_ENV" && !keys.includes(key),
    );
    expect({ duplicates, missing }).toEqual({ duplicates: [], missing: [] });
  });
});
