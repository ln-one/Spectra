import { expect, test } from "vitest";
import { handleError, normalizeHandle, passwordError } from "./validators";

test("normalizes and validates Spectra handles", () => {
  expect(normalizeHandle(" Alice-Notes ")).toBe("alice-notes");
  expect(handleError("alice-notes")).toBeNull();
  expect(handleError("two--dashes")).not.toBeNull();
  expect(handleError("workspaces")).toBe("handle_reserved");
});

test("requires an 8+ character password mixing at least two character classes", () => {
  expect(passwordError("correct horse battery staple")).toBeNull();
  expect(passwordError("abcd1234")).toBeNull();
  expect(passwordError("too short")).toBeNull();
  expect(passwordError("short")).toBe("password_short");
  expect(passwordError("123456789012345")).toBe("password_classes");
  expect(passwordError("aaaaaaaa")).toBe("password_classes");
  expect(passwordError("a".repeat(129))).toBe("password_long");
});
