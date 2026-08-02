import { expect, test } from "vitest";
import { handleError, normalizeHandle, passwordError } from "./validators";

test("normalizes and validates Spectra handles", () => {
  expect(normalizeHandle(" Alice-Notes ")).toBe("alice-notes");
  expect(handleError("alice-notes")).toBeNull();
  expect(handleError("two--dashes")).not.toBeNull();
  expect(handleError("workspaces")).toBe("handle_reserved");
});

test("requires a long password but does not impose character-composition rules", () => {
  expect(passwordError("correct horse battery staple")).toBeNull();
  expect(passwordError("123456789012345")).toBeNull();
  expect(passwordError("too short")).toBe("password_length");
});
