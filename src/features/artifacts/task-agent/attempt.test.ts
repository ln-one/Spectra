import { expect, test } from "vitest";
import { redactedTaskAgentFailureDetail } from "./attempt";

test("redacts common credentials from persisted task-agent failures", () => {
  const detail = redactedTaskAgentFailureDetail(
    new Error(
      "api_key=top-secret bearer token-value sk-exampleproviderkey123456 " +
        "https://user:password@example.test/error?signature=signed-value",
    ),
  );

  expect(detail).not.toContain("top-secret");
  expect(detail).not.toContain("token-value");
  expect(detail).not.toContain("sk-exampleproviderkey123456");
  expect(detail).not.toContain("user:password");
  expect(detail).not.toContain("signed-value");
  expect(detail.match(/\[REDACTED]/g)?.length).toBeGreaterThanOrEqual(5);
});
