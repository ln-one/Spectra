import "server-only";

type RunCancellationRegistry = Map<string, AbortController>;

const globalRunCancellationState = globalThis as typeof globalThis & {
  spectraAiRunCancellationRegistry?: RunCancellationRegistry;
};

function runCancellationRegistry() {
  const existing = globalRunCancellationState.spectraAiRunCancellationRegistry;
  if (existing) return existing;
  const registry = new Map<string, AbortController>();
  globalRunCancellationState.spectraAiRunCancellationRegistry = registry;
  return registry;
}

export function registerAiRunCancellation(runId: string) {
  const registry = runCancellationRegistry();
  const existing = registry.get(runId);
  if (existing) return existing;

  const controller = new AbortController();
  registry.set(runId, controller);
  return controller;
}

export function unregisterAiRunCancellation(runId: string, controller: AbortController) {
  const registry = runCancellationRegistry();
  if (registry.get(runId) === controller) registry.delete(runId);
}

export function abortAiRun(runId: string) {
  const controller = runCancellationRegistry().get(runId);
  if (!controller) return false;
  if (!controller.signal.aborted) controller.abort(new Error("AI run cancelled"));
  return true;
}
