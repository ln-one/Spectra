import { expect, test } from "vitest";
import { authRecoveryHref, loginHref, registerHref, safeRedirectPath } from "./redirect";

test("accepts only same-origin relative redirect paths", () => {
  expect(safeRedirectPath("/developer/biology?tab=sources#item")).toBe(
    "/developer/biology?tab=sources#item",
  );
  expect(safeRedirectPath("https://attacker.example/path")).toBe("/workspaces");
  expect(safeRedirectPath("//attacker.example/path")).toBe("/workspaces");
  expect(safeRedirectPath(undefined)).toBe("/workspaces");
});

test("builds login and handle-completion destinations", () => {
  expect(loginHref("/workspaces/new")).toBe("/auth/login?redirect=%2Fworkspaces%2Fnew");
  expect(registerHref("/developer/biology", true)).toBe(
    "/auth/register?redirect=%2Fdeveloper%2Fbiology&mode=handle",
  );
});

test("sends disabled principals to login so they can sign out", () => {
  expect(authRecoveryHref({ code: "principal_disabled" }, "/workspaces")).toBe(
    "/auth/login?redirect=%2Fworkspaces",
  );
});
