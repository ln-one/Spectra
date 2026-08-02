import type {
  ExpectedStep,
  Trajectory,
  TrajectoryExpectation,
  TrajectoryStep,
} from "@mastra/core/evals";
import { createTrajectoryScorerCode } from "@mastra/evals/scorers/prebuilt";
import { createTrajectoryTestRun } from "@mastra/evals/scorers/utils";
import { z } from "zod";

const agenticRagTrajectoryStepSchema = z
  .object({
    name: z.string().trim().min(1),
    stepType: z.enum(["tool_call", "provider_tool_call"]),
    toolArgs: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const agenticRagTrajectoryCaseSchema = z
  .object({
    id: z.string().trim().min(1),
    expected: z.array(agenticRagTrajectoryStepSchema).max(6),
    ordering: z.enum(["strict", "relaxed", "unordered"]).default("strict"),
  })
  .strict();

export type AgenticRagTrajectoryCase = z.infer<typeof agenticRagTrajectoryCaseSchema>;
export type AgenticRagTrajectoryStep = z.infer<typeof agenticRagTrajectoryStepSchema>;

function expectation(testCase: AgenticRagTrajectoryCase): TrajectoryExpectation {
  return {
    steps: testCase.expected.map(
      (step): ExpectedStep =>
        step.stepType === "tool_call"
          ? {
              name: step.name,
              stepType: "tool_call",
              ...(step.toolArgs ? { toolArgs: step.toolArgs } : {}),
            }
          : {
              // Mastra's ExpectedStep union currently omits provider_tool_call even though
              // runtime Trajectory supports it. Normalize only for scoring; fixtures retain provenance.
              name: step.name,
              stepType: "tool_call",
              ...(step.toolArgs ? { toolArgs: step.toolArgs } : {}),
            },
    ),
    ordering: testCase.ordering,
    allowRepeatedSteps: true,
    maxSteps: 6,
    noRedundantCalls: true,
  };
}

export async function scoreAgenticRagTrajectory(
  testCase: AgenticRagTrajectoryCase,
  actual: AgenticRagTrajectoryStep[],
) {
  const parsedCase = agenticRagTrajectoryCaseSchema.parse(testCase);
  for (const step of actual) {
    const expectedProvenance = new Set(
      parsedCase.expected
        .filter((candidate) => candidate.name === step.name)
        .map((candidate) => candidate.stepType),
    );
    if (expectedProvenance.size > 0 && !expectedProvenance.has(step.stepType)) {
      throw new Error(`agentic_rag_provenance_mismatch:${step.name}`);
    }
  }
  const trajectory: Trajectory = {
    steps: actual.map(
      (step): TrajectoryStep => ({
        name: step.name,
        stepType: "tool_call",
        ...(step.toolArgs ? { toolArgs: step.toolArgs } : {}),
      }),
    ),
  };
  const scorer = createTrajectoryScorerCode({
    defaults: expectation(parsedCase),
    weights: { accuracy: 0.7, efficiency: 0.3 },
  });
  return scorer.run(
    createTrajectoryTestRun({
      expectedTrajectory: expectation(parsedCase),
      trajectory,
    }),
  );
}
