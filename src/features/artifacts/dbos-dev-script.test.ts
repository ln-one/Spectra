import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("DBOS development worker", () => {
  test("restarts cleanly on source changes and exits when the worker crashes", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["worker:dbos:dev"]).toBe(
      'nodemon --watch src --ext ts,tsx --signal SIGTERM --exitcrash --exec "node --conditions=react-server --import tsx src/worker/dbos.ts"',
    );
    expect(packageJson.scripts?.dev).toContain("run-observed-development.mjs");
    expect(packageJson.scripts?.["dev:processes"]).toContain('"npm:worker:dbos:dev"');
    expect(packageJson.scripts?.["dev:processes"]).toContain("--kill-others");
  });
});
