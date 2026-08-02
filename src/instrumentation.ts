import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const [{ validateWebEnvironment }, { startApplicationTracing }] = await Promise.all([
    import("@/environment/server"),
    import("@/observability/tracing.server"),
  ]);
  const environment = validateWebEnvironment();
  startApplicationTracing("spectra-web", environment);
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { webLogger } = await import("@/observability/server");
  webLogger.error(
    {
      error,
      errorDigest:
        error instanceof Error && "digest" in error && typeof error.digest === "string"
          ? error.digest
          : undefined,
      event: "web.request.unhandled_error",
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
      routerKind: context.routerKind,
    },
    "Unhandled Next.js request error",
  );
};
