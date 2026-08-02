import { expect, test } from "vitest";
import { negotiateLocale } from "./config";

test("prefers a valid locale cookie over the browser language", () => {
  expect(negotiateLocale("zh-CN", "en-US,en;q=0.9")).toBe("zh-CN");
});

test("matches the browser language when no valid cookie exists", () => {
  expect(negotiateLocale(undefined, "en-GB,en;q=0.9,zh;q=0.8")).toBe("en-US");
});

test("falls back to simplified Chinese for invalid or missing preferences", () => {
  expect(negotiateLocale("invalid", null)).toBe("zh-CN");
  expect(negotiateLocale(undefined, "not a valid language header;;;;")).toBe("zh-CN");
});
