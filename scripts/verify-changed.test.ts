import { describe, expect, test } from "vitest";
import { changedVerificationPlan } from "./verify-changed";

describe("changed verification plan", () => {
  test("selects fast code checks for UI changes", () => {
    const plan = changedVerificationPlan(["src/features/workspaces/workbench/WorkbenchView.tsx"]);

    expect(plan).toMatchObject({
      architecture: true,
      database: false,
      typecheck: true,
    });
    expect(plan.biomeFiles).toEqual(["src/features/workspaces/workbench/WorkbenchView.tsx"]);
    expect(plan.testRelatedFiles).toEqual(["src/features/workspaces/workbench/WorkbenchView.tsx"]);
  });

  test("runs Drizzle validation only for database contract changes", () => {
    const plan = changedVerificationPlan([
      "drizzle/20260728000000_example.sql",
      "src/database/schema.ts",
    ]);

    expect(plan.database).toBe(true);
    expect(plan.architecture).toBe(true);
  });

  test("does not send generated binary output to Biome or Vitest", () => {
    const plan = changedVerificationPlan([
      "output/task-agent-live/example/animation.mp4",
      "output/task-agent-live/example/presentation.pptx",
    ]);

    expect(plan.biomeFiles).toEqual([]);
    expect(plan.testRelatedFiles).toEqual([]);
    expect(plan.typecheck).toBe(false);
  });
});
