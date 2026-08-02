import { afterEach, expect, test, vi } from "vitest";

const loggerError = vi.hoisted(() => vi.fn());
const tracing = vi.hoisted(() => ({
  start: vi.fn(),
}));

vi.mock("@/observability/server", () => ({
  webLogger: { error: loggerError },
}));
vi.mock("@/environment/server", () => ({
  validateWebEnvironment: vi.fn(() => ({ NODE_ENV: "test" })),
}));
vi.mock("@/observability/tracing.server", () => ({
  startApplicationTracing: tracing.start,
}));

import { onRequestError, register } from "./instrumentation";

const previousRuntime = process.env.NEXT_RUNTIME;

afterEach(() => {
  loggerError.mockReset();
  tracing.start.mockClear();
  vi.restoreAllMocks();
  process.env.NEXT_RUNTIME = previousRuntime;
});

test("starts Web tracing through the official Next instrumentation lifecycle", async () => {
  process.env.NEXT_RUNTIME = "nodejs";

  await register();

  expect(tracing.start).toHaveBeenCalledWith("spectra-web", { NODE_ENV: "test" });
});

test("records only safe Next route metadata for unhandled request errors", async () => {
  process.env.NEXT_RUNTIME = "nodejs";
  const error = Object.assign(new Error("route failed"), { digest: "digest-1" });

  await onRequestError(
    error,
    {
      headers: { authorization: "Bearer secret" },
      method: "POST",
      path: "/workspaces/private?token=secret",
    } as never,
    {
      renderSource: "react-server-components",
      revalidateReason: undefined,
      routePath: "/workspaces/[id]",
      routeType: "route",
      routerKind: "App Router",
    } as never,
  );

  expect(loggerError).toHaveBeenCalledOnce();
  const [fields] = loggerError.mock.calls[0] ?? [];
  expect(fields).toEqual({
    error,
    errorDigest: "digest-1",
    event: "web.request.unhandled_error",
    method: "POST",
    routePath: "/workspaces/[id]",
    routeType: "route",
    routerKind: "App Router",
  });
  expect(JSON.stringify(fields)).not.toContain("Bearer secret");
  expect(JSON.stringify(fields)).not.toContain("/workspaces/private");
});
