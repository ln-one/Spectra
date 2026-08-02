import { expect, test } from "vitest";
import { workspaceInputFromCreationIntent } from "./intent";

test("prefers and trims an explicit project name", () => {
  expect(
    workspaceInputFromCreationIntent({ idea: "Ignored idea", projectName: "  Biology Lab  " }),
  ).toEqual({ name: "Biology Lab" });
});

test("uses the idea without splitting grapheme clusters at the database boundary", () => {
  const combiningCharacter = "e\u0301";
  expect(
    workspaceInputFromCreationIntent({
      idea: `${"a".repeat(198)}${combiningCharacter}ignored`,
      projectName: "",
    }),
  ).toEqual({ name: `${"a".repeat(198)}${combiningCharacter}` });

  expect(
    workspaceInputFromCreationIntent({
      idea: `${"a".repeat(199)}👨‍👩‍👧‍👦`,
      projectName: "",
    }),
  ).toEqual({ name: "a".repeat(199) });
});

test("rejects blank, oversized, and forged creation intent", () => {
  expect(() => workspaceInputFromCreationIntent({ idea: "  ", projectName: "" })).toThrow();
  expect(() =>
    workspaceInputFromCreationIntent({ idea: "Idea", projectName: "a".repeat(201) }),
  ).toThrow();
  expect(() =>
    workspaceInputFromCreationIntent({
      idea: "Idea",
      projectName: "",
      ownerId: crypto.randomUUID(),
    }),
  ).toThrow();
});
