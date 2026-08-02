import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

const ARTIFACT_ROOT = path.resolve(process.cwd(), "src/features/artifacts");

async function productionFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return productionFiles(absolute);
      if (!entry.name.match(/\.(ts|tsx)$/) || entry.name.includes(".test.")) return [];
      return [absolute];
    }),
  );
  return files.flat();
}

test("keeps cross-feature DBOS registration in the worker composition root", async () => {
  await expect(
    readFile(path.join(ARTIFACT_ROOT, "dbos-runtime.server.ts"), "utf8"),
  ).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(path.join(ARTIFACT_ROOT, "dbos-queues.ts"), "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  });
  const bootstrap = await readFile(
    path.resolve(process.cwd(), "src/worker/dbos-runtime.server.ts"),
    "utf8",
  );
  expect(bootstrap).toContain("registerTeachingDocumentDbosWorkflow");
  expect(bootstrap).toContain("registerSourceIngestionDbosWorkflow");
  expect(bootstrap).toContain("registerKnowledgeIndexingDbosWorkflow");
  expect(bootstrap).toContain("registerCleanupDbosWorkflows");
});

test("composes Source ingestion and Knowledge indexing only at worker bootstrap", async () => {
  const bootstrap = await readFile(
    path.resolve(process.cwd(), "src/worker/dbos-runtime.server.ts"),
    "utf8",
  );
  expect(bootstrap).toContain("registerSourceIngestionDbosWorkflow");
  expect(bootstrap).toContain("scheduleReadyIngestion");
  expect(bootstrap).toContain("queueKnowledgeIndexForIngestion");
});

test("registers one canonical Source ingestion workflow with stable Step order", async () => {
  const contract = await readFile(
    path.resolve(process.cwd(), "src/features/sources/ingestion/dbos.ts"),
    "utf8",
  );
  const worker = await readFile(
    path.resolve(process.cwd(), "src/features/sources/ingestion/dbos-worker.ts"),
    "utf8",
  );
  expect(contract).toContain('SOURCE_INGESTION_DBOS_WORKFLOW = "ingestSource"');
  expect(worker).toContain("name: SOURCE_INGESTION_DBOS_WORKFLOW");
  expect(worker).toContain('name: "loadKnowledgeIndexingPolicy"');
  expect(worker).toContain('name: "scheduleKnowledgeIndexing"');
  const workflow = worker.slice(
    worker.indexOf("async function sourceIngestionWorkflow"),
    worker.indexOf("return DBOS.registerWorkflow(sourceIngestionWorkflow"),
  );
  expect(workflow.indexOf("loadKnowledgeIndexingPolicy")).toBeLessThan(
    workflow.indexOf("processSourceIngestion"),
  );
  expect(workflow.indexOf("processSourceIngestion")).toBeLessThan(
    workflow.indexOf("scheduleKnowledgeIndexing"),
  );
});

test("keeps Source cleanup mechanics behind the Sources cleanup API", async () => {
  const worker = await readFile(
    path.resolve(process.cwd(), "src/features/maintenance/cleanup-dbos-worker.ts"),
    "utf8",
  );
  expect(worker).toContain("createSourceCleanupOperations");
  expect(worker).toContain("createKnowledgeSourceCleanupOperations");
  expect(worker).toContain('name: "purgeDeletedSourceKnowledgeIndex"');
  expect(worker).not.toContain("sourceIngestions");
  expect(worker).not.toContain("retrievalIndexGenerations");
});

test("reconciles only existing Knowledge generations without scanning historical ingestions", async () => {
  const reconciliation = await readFile(
    path.resolve(process.cwd(), "src/features/knowledge/dbos.ts"),
    "utf8",
  );
  expect(reconciliation).toContain("retrievalIndexGenerations");
  expect(reconciliation).not.toContain("sourceIngestions");
});

test("validates the complete Knowledge environment before composing the Agent tool", async () => {
  const composition = await readFile(
    path.resolve(process.cwd(), "src/features/agents/server.ts"),
    "utf8",
  );
  expect(composition).toContain("knowledgeEnvironment(environment).indexingEnabled");
  expect(composition).not.toContain("knowledgeIndexingEnabled(environment)");
});

test("keeps runtime source free of version-compatibility markers", async () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const violations: string[] = [];
  for (const file of await productionFiles(sourceRoot)) {
    const source = await readFile(file, "utf8");
    if (source.includes("@deprecated")) {
      violations.push(`${path.relative(process.cwd(), file)} declares @deprecated`);
    }
    if (/\bLEGACY_[A-Z0-9_]*\b/.test(source)) {
      violations.push(`${path.relative(process.cwd(), file)} declares a LEGACY_ identifier`);
    }
  }
  expect(violations).toEqual([]);
});

test("keeps the Workbench Artifact interaction channel kind-agnostic", async () => {
  const workbenchRoot = path.resolve(process.cwd(), "src/features/workspaces/workbench");
  const files = ["WorkbenchView.tsx", "ChatPanelView.tsx", "WorkbenchChatRuntime.tsx"];
  const forbiddenNames = [
    "onTeachingDocumentProposal",
    "onMindMapProposal",
    "onQuizProposal",
    "teachingDocumentFocus",
    "mindMapFocus",
    "quizFocus",
  ];
  const violations: string[] = [];
  for (const name of files) {
    const source = await readFile(path.join(workbenchRoot, name), "utf8");
    for (const forbidden of forbiddenNames) {
      if (source.includes(forbidden)) {
        violations.push(`${name} contains concrete Artifact channel ${forbidden}`);
      }
    }
  }
  expect(violations).toEqual([]);
});

test("keeps Artifact read tools outside the mutation registry", async () => {
  const agentsRoot = path.resolve(process.cwd(), "src/features/agents");
  const registry = await readFile(path.join(agentsRoot, "artifact-tools.server.ts"), "utf8");
  const reads = await readFile(path.join(agentsRoot, "artifact-read-tools.server.ts"), "utf8");
  expect(registry).not.toContain("readCurrentArtifactToolInputSchema");
  expect(registry).not.toContain("readTeachingDocumentToolInputSchema");
  expect(registry).toContain("createArtifactReadTools");
  expect(reads).toContain("readCurrentArtifactToolInputSchema");
  expect(reads).toContain("readTeachingDocumentToolInputSchema");
});

test("keeps Artifact creation and editing outside the tool composition root", async () => {
  const agentsRoot = path.resolve(process.cwd(), "src/features/agents");
  const registry = await readFile(path.join(agentsRoot, "artifact-tools.server.ts"), "utf8");
  const creation = await readFile(path.join(agentsRoot, "artifact-create-tools.server.ts"), "utf8");
  const editing = await readFile(path.join(agentsRoot, "artifact-edit-tools.server.ts"), "utf8");
  expect(registry).not.toContain("createTool(");
  expect(registry).not.toContain("createArtifactsToolInputSchemaFor");
  expect(registry).not.toContain("proposeCurrentMindMapEditsToolInputSchema");
  expect(registry).toContain("createArtifactCreationTools");
  expect(registry).toContain("createArtifactEditTools");
  expect(creation).toContain("createArtifactsToolInputSchemaFor");
  expect(editing).toContain("proposeCurrentMindMapEditsToolInputSchema");
});

test("keeps Artifact tool idempotency and examples outside the tool registry", async () => {
  const agentsRoot = path.resolve(process.cwd(), "src/features/agents");
  const registry = await readFile(path.join(agentsRoot, "artifact-tools.server.ts"), "utf8");
  const idempotency = await readFile(
    path.join(agentsRoot, "artifact-tool-idempotency.server.ts"),
    "utf8",
  );
  const examples = await readFile(
    path.join(agentsRoot, "artifact-create-tool-examples.ts"),
    "utf8",
  );
  expect(registry).not.toContain("canonicalJsonSha256");
  expect(registry).toContain("createArtifactCreationTools");
  expect(idempotency).toContain("canonicalJsonSha256");
  expect(examples).toContain("Requested teaching document");
});

test("keeps Quiz transport and Attempt state outside the workspace view", async () => {
  const workbenchRoot = path.resolve(process.cwd(), "src/features/workspaces/workbench");
  const view = await readFile(path.join(workbenchRoot, "QuizWorkspaceView.tsx"), "utf8");
  const session = await readFile(path.join(workbenchRoot, "useQuizAttemptSession.ts"), "utf8");
  const client = await readFile(path.join(workbenchRoot, "quiz-workspace-client.ts"), "utf8");
  expect(view).not.toMatch(/\bfetch\(/);
  expect(view).not.toContain("useQuery(");
  expect(view).not.toContain("useQueryClient(");
  expect(session).toContain("useQuery(");
  expect(session).toContain("pendingSaveDrafts");
  expect(client).toContain("fetch(");
});

test("keeps Game transport and Run state outside the workspace view", async () => {
  const workbenchRoot = path.resolve(process.cwd(), "src/features/workspaces/workbench");
  const view = await readFile(path.join(workbenchRoot, "GameWorkspaceView.tsx"), "utf8");
  const session = await readFile(path.join(workbenchRoot, "useGameRunSession.ts"), "utf8");
  const client = await readFile(path.join(workbenchRoot, "game-workspace-client.ts"), "utf8");
  expect(view).not.toMatch(/\bfetch\(/);
  expect(view).not.toContain("useQuery(");
  expect(view).not.toContain("useQueryClient(");
  expect(view).not.toContain("useMutation(");
  expect(session).toContain("useQuery(");
  expect(session).toContain("revivalSubmitRequestId");
  expect(client).toContain("fetch(");
});

test("keeps Mind Map transport and session state outside the workspace view", async () => {
  const workbenchRoot = path.resolve(process.cwd(), "src/features/workspaces/workbench");
  const view = await readFile(path.join(workbenchRoot, "MindMapWorkspaceView.tsx"), "utf8");
  const session = await readFile(path.join(workbenchRoot, "useMindMapWorkspaceSession.ts"), "utf8");
  const client = await readFile(path.join(workbenchRoot, "mind-map-workspace-client.ts"), "utf8");
  const viewState = await readFile(path.join(workbenchRoot, "mind-map-view-state.ts"), "utf8");
  expect(view).not.toMatch(/\bfetch\(/);
  expect(view).not.toContain("localStorage");
  expect(view).not.toContain("useEffect(");
  expect(session).toContain("proposalRunId");
  expect(client).toContain("fetch(");
  expect(viewState).toContain("localStorage");
});

test("keeps Teaching Document transport and editor extensions outside the workspace view", async () => {
  const workbenchRoot = path.resolve(process.cwd(), "src/features/workspaces/workbench");
  const view = await readFile(
    path.join(workbenchRoot, "TeachingDocumentWorkspaceView.tsx"),
    "utf8",
  );
  const client = await readFile(
    path.join(workbenchRoot, "teaching-document-workspace-client.ts"),
    "utf8",
  );
  const extensions = await readFile(
    path.join(workbenchRoot, "teaching-document-editor-extensions.tsx"),
    "utf8",
  );
  expect(view).not.toMatch(/\bfetch\(/);
  expect(view).not.toContain("PluginKey");
  expect(view).not.toContain("DecorationSet");
  expect(client).toContain("fetch(");
  expect(extensions).toContain("teachingDocumentRefineReview");
  expect(extensions).toContain("teachingDocumentAssistantFocus");
});

test("keeps Artifact query synchronization outside the Workbench view", async () => {
  const workbenchRoot = path.resolve(process.cwd(), "src/features/workspaces/workbench");
  const view = await readFile(path.join(workbenchRoot, "WorkbenchView.tsx"), "utf8");
  const data = await readFile(path.join(workbenchRoot, "useArtifactWorkbenchData.ts"), "utf8");
  expect(view).not.toContain("useQuery(");
  expect(view).not.toContain("useQueryClient(");
  expect(view).not.toContain("useArtifactLiveUpdates(");
  expect(view).toContain("useArtifactWorkbenchData(");
  expect(data).toContain("useQuery(");
  expect(data).toContain("useArtifactLiveUpdates(");
});
