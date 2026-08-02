import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const workflowFiles = [".github/workflows/ci.yml", ".github/workflows/ai-evals.yml"];

type WorkflowStep = {
  run?: unknown;
  uses?: unknown;
};

type Workflow = {
  jobs?: Record<string, { steps?: WorkflowStep[] }>;
};

describe("CI workflow contracts", () => {
  it("configures Tiptap Pro before every npm ci without checking out Stratumind", async () => {
    for (const file of workflowFiles) {
      const source = await readFile(file, "utf8");
      const workflow = parse(source) as Workflow;

      expect(source).not.toContain("repository: ln-one/Stratumind");
      expect(source).not.toContain(".ci/stratumind");
      expect(source).not.toContain("Build pinned Stratumind acceptance runtime");
      expect(source).toContain("secrets.TIPTAP_PRO_TOKEN");

      for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
        const steps = job.steps ?? [];
        steps.forEach((step, index) => {
          if (step.run !== "npm ci") return;
          const configured = steps
            .slice(0, index)
            .some((candidate) => candidate.uses === "./.github/actions/setup-tiptap-pro-registry");
          expect(configured, `${file}:${jobName} must configure Tiptap before npm ci`).toBe(true);
        });
      }
    }
  });

  it("consumes the public versioned Stratumind image through Compose", async () => {
    const [compose, acceptanceCompose, envExample, ci, aiEvals] = await Promise.all([
      readFile("compose.yaml", "utf8"),
      readFile("compose.knowledge-acceptance.yaml", "utf8"),
      readFile(".env.example", "utf8"),
      readFile(".github/workflows/ci.yml", "utf8"),
      readFile(".github/workflows/ai-evals.yml", "utf8"),
    ]);
    const expected = "ghcr.io/ln-one/stratumind:api-v1.1.7";
    const expectedCiImage =
      "ghcr.io/ln-one/stratumind@sha256:5792dc0ec7836499d6001703c57c2f781378e0aa24c7316000b39ecd0ec93de0";

    expect(compose).toContain(`SPECTRA_STRATUMIND_IMAGE:-${expected}`);
    expect(acceptanceCompose).toContain(`SPECTRA_STRATUMIND_IMAGE:-${expected}`);
    expect(envExample).toContain(`SPECTRA_STRATUMIND_IMAGE=${expected}`);
    for (const workflow of [ci, aiEvals]) {
      expect(workflow).toContain(`SPECTRA_STRATUMIND_IMAGE: ${expectedCiImage}`);
      expect(workflow).not.toContain(expected);
    }
  });

  it("keeps registry credentials outside the repository and npm cache", async () => {
    const action = await readFile(".github/actions/setup-tiptap-pro-registry/action.yml", "utf8");

    expect(action).toContain("$RUNNER_TEMP/spectra-tiptap.npmrc");
    expect(action).toContain("NPM_CONFIG_USERCONFIG=");
    expect(action).toContain("umask 077");
    expect(action).not.toContain("npm config set");
    expect(action).not.toContain('echo "$TIPTAP_PRO_TOKEN"');
  });
});
