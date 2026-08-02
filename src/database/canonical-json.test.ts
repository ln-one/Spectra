import { describe, expect, it } from "vitest";
import { canonicalJson, canonicalJsonSha256 } from "./canonical-json";

describe("RFC 8785 canonical JSON", () => {
  it("is stable across object key order", () => {
    const left = { b: [3, { y: true, x: "值" }], a: 1 };
    const right = { a: 1, b: [3, { x: "值", y: true }] };
    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(canonicalJsonSha256(left)).toBe(canonicalJsonSha256(right));
  });
});
