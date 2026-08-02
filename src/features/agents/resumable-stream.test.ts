import { describe, expect, test } from "vitest";
import { testServerEnvironment } from "@/environment/test";
import { agentStreamEnvironment } from "./resumable-stream";

describe("agent resumable stream configuration", () => {
  test("accepts an explicit Redis endpoint", () => {
    expect(
      agentStreamEnvironment(
        testServerEnvironment({
          REDIS_URL: "rediss://cache.example.test:6380",
        }),
      ),
    ).toEqual({ url: "rediss://cache.example.test:6380" });
  });

  test("rejects missing and non-Redis endpoints", () => {
    expect(() => agentStreamEnvironment(testServerEnvironment())).toThrow();
    expect(() =>
      agentStreamEnvironment(testServerEnvironment({ REDIS_URL: "https://example.test" })),
    ).toThrow("Invalid environment variables");
  });
});
