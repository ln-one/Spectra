import { expect, test } from "vitest";
import { testServerEnvironment } from "@/environment/test";
import { isSignUpEnabled } from "./policy";

test("opens sign-up in development and when explicitly enabled", () => {
  expect(isSignUpEnabled(testServerEnvironment({ NODE_ENV: "development" }))).toBe(true);
  expect(isSignUpEnabled(testServerEnvironment({ NODE_ENV: "production" }))).toBe(false);
  expect(
    isSignUpEnabled(
      testServerEnvironment({ AUTH_SIGN_UP_ENABLED: "true", NODE_ENV: "production" }),
    ),
  ).toBe(true);
  expect(isSignUpEnabled(testServerEnvironment())).toBe(false);
});
