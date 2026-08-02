import { describe, expect, it } from "vitest";
import { createSeededRandom, seededShuffle } from "./random";

describe("game seeded randomness", () => {
  it("replays the same sequence for the same seed", () => {
    const left = createSeededRandom("run-1");
    const right = createSeededRandom("run-1");
    expect(Array.from({ length: 20 }, left)).toEqual(Array.from({ length: 20 }, right));
  });

  it("creates a stable question order without mutating the pool", () => {
    const source = ["a", "b", "c", "d", "e", "f"];
    expect(seededShuffle(source, "run-1")).toEqual(seededShuffle(source, "run-1"));
    expect(source).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});
