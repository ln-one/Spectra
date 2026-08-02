import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { z } from "zod";

const stepSchema = z
  .object({
    env: z.record(z.string(), z.unknown()).optional(),
    if: z.string().optional(),
    name: z.string().optional(),
    run: z.string().optional(),
    uses: z.string().optional(),
    with: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const jobSchema = z
  .object({
    if: z.string().optional(),
    steps: z.array(stepSchema),
  })
  .passthrough();

const workflowSchema = z
  .object({
    on: z
      .object({
        workflow_dispatch: z
          .object({
            inputs: z
              .object({
                suite: z
                  .object({
                    default: z.literal("all"),
                    options: z.tuple([
                      z.literal("all"),
                      z.literal("agent"),
                      z.literal("knowledge"),
                    ]),
                  })
                  .passthrough(),
              })
              .passthrough(),
          })
          .passthrough(),
      })
      .passthrough(),
    env: z.record(z.string(), z.unknown()),
    jobs: z.object({
      agent: jobSchema,
      knowledge: jobSchema,
    }),
  })
  .passthrough();

describe("AI evaluation workflow", () => {
  it("keeps live suites manual, secret-backed and limited to safe reports", async () => {
    const workflow = workflowSchema.parse(
      parse(await readFile(".github/workflows/ai-evals.yml", "utf8")),
    );

    expect(workflow.env.DASHSCOPE_API_KEY).toBeUndefined();
    expect(workflow.jobs.agent.if).toContain("inputs.suite == 'agent'");
    expect(workflow.jobs.knowledge.if).toContain("inputs.suite == 'knowledge'");
    const agentRun = workflow.jobs.agent.steps.find(
      (step) => step.run === "npm run eval:agent:live",
    );
    const knowledgeRun = workflow.jobs.knowledge.steps.find(
      (step) => step.run === "npm run knowledge:acceptance:live",
    );
    expect(agentRun?.env?.DASHSCOPE_API_KEY).toContain("secrets.DASHSCOPE_API_KEY");
    expect(knowledgeRun?.env?.DASHSCOPE_API_KEY).toContain("secrets.DASHSCOPE_API_KEY");
    for (const job of [workflow.jobs.agent, workflow.jobs.knowledge]) {
      for (const step of job.steps.filter((candidate) => candidate.uses)) {
        expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
        expect(step.env?.DASHSCOPE_API_KEY).toBeUndefined();
      }
    }

    const agentUpload = workflow.jobs.agent.steps.find((step) =>
      step.uses?.startsWith("actions/upload-artifact@"),
    );
    const knowledgeUpload = workflow.jobs.knowledge.steps.find((step) =>
      step.uses?.startsWith("actions/upload-artifact@"),
    );
    expect(agentUpload?.if).toBe("always()");
    expect(agentUpload?.with?.path).toContain("report.json");
    expect(knowledgeUpload?.if).toBe("always()");
    expect(knowledgeUpload?.with?.path).toContain("summary.json");
    expect(knowledgeUpload?.with?.path).not.toContain("/report.");
    expect(workflow.jobs.knowledge.steps.at(-1)?.run).toBe(
      "npm run knowledge:acceptance:infra:down",
    );
    expect(workflow.jobs.knowledge.steps.at(-1)?.if).toBe("always()");
  });
});
