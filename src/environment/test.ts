import { serverEnvironment } from "./server";

export function testServerEnvironment(
  overrides: Readonly<Record<string, string | undefined>> = {},
) {
  return serverEnvironment({ NODE_ENV: "test", ...overrides });
}
