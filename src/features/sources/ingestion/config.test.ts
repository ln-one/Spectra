import { describe, expect, test } from "vitest";
import { testServerEnvironment } from "@/environment/test";
import { mineruEnvironment, mineruProcessingProfile, parseMineruToken } from "./config";

describe("MinerU configuration", () => {
  test("parses its credential at one boundary", () => {
    expect(mineruEnvironment(testServerEnvironment({ MINERU_API_TOKEN: " test-token " }))).toEqual({
      apiToken: "test-token",
    });
    expect(() => mineruEnvironment(testServerEnvironment())).toThrow();
    expect(parseMineruToken(" injected-token ")).toBe("injected-token");
    expect(() => parseMineruToken("  ")).toThrow();
  });

  test("keeps the processing profile explicit", () => {
    expect(mineruProcessingProfile).toEqual({
      formula: true,
      language: "ch",
      model: "vlm",
      ocr: true,
      table: true,
    });
  });
});
