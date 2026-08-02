import { expect, test } from "vitest";
import { artifactRenderWorkflowId } from "./render-dbos";

test("fences render workflow replay by job attempt", () => {
  const jobId = "00000000-0000-4000-8000-000000000416";
  expect(artifactRenderWorkflowId(jobId, 1)).toBe(`render:${jobId}:1`);
  expect(artifactRenderWorkflowId(jobId, 2)).toBe(`render:${jobId}:2`);
});
