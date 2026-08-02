import { expect, test } from "vitest";
import { testServerEnvironment } from "@/environment/test";
import { isSignUpEnabled } from "./policy";

test("opens sign-up only in development", () => {
  expect(isSignUpEnabled(testServerEnvironment({ NODE_ENV: "development" }))).toBe(true);
  expect(isSignUpEnabled(testServerEnvironment({ NODE_ENV: "production" }))).toBe(false);
  expect(isSignUpEnabled(testServerEnvironment())).toBe(false);
});
