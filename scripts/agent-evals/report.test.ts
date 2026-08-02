import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeAgentEvalReport } from "./report";

const outputRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    outputRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("agent evaluation report", () => {
  it("writes only stable case metadata and scores", async () => {
    const outputRoot = path.resolve("test-results/agent-evals-test", crypto.randomUUID());
    outputRoots.push(outputRoot);
    const { directory } = await writeAgentEvalReport({
      mode: "live",
      modelId: "evaluation-model",
      outputRoot,
      cases: [
        {
          id: "grounded-answer",
          durationMs: 12,
          passed: false,
          scores: { faithfulness: 0.7 },
          failureCode: "faithfulness_below_threshold",
        },
      ],
    });

    const contents = await Promise.all([
      readFile(path.join(directory, "report.json"), "utf8"),
      readFile(path.join(directory, "report.md"), "utf8"),
    ]);
    for (const content of contents) {
      expect(content).not.toContain("private prompt");
      expect(content).not.toContain("private answer");
      expect(content).toContain("grounded-answer");
      expect(content).toContain("faithfulness_below_threshold");
    }
  });
});
