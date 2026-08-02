import { type ServerEnvironment, serverEnvironment } from "@/environment/server";

export function animationRenderEnvironment(environment: ServerEnvironment = serverEnvironment()) {
  return {
    ...(environment.REMOTION_BROWSER_EXECUTABLE
      ? { browserExecutable: environment.REMOTION_BROWSER_EXECUTABLE }
      : {}),
    concurrency: environment.ANIMATION_RENDER_CONCURRENCY,
    ...(environment.ANIMATION_RENDER_SANDBOX_EXECUTABLE
      ? { sandboxExecutable: environment.ANIMATION_RENDER_SANDBOX_EXECUTABLE }
      : {}),
    timeoutMs: environment.ANIMATION_RENDER_TIMEOUT_MS,
  };
}
