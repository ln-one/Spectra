import { expect, test } from "vitest";
import english from "../../messages/en-US.json";
import chinese from "../../messages/zh-CN.json";

function flattenMessages(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      Object.entries(flattenMessages(child, prefix ? `${prefix}.${key}` : key)),
    ),
  );
}

test("keeps locale catalogs complete and aligned", () => {
  const zh = flattenMessages(chinese);
  const en = flattenMessages(english);

  expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  expect(Object.values(zh).every((message) => message.trim().length > 0)).toBe(true);
  expect(Object.values(en).every((message) => message.trim().length > 0)).toBe(true);
});
