import { describe, expect, it } from "vitest";
import {
  advanceBird,
  birdCollides,
  createPipeGapCenter,
  FLAP_GRAVITY,
  FLAP_MECHANICS,
  FLAP_THRUST,
  pipeCrossedBird,
} from "./mechanics";

describe("Sidequest behavior fixture", () => {
  it("keeps the frozen upstream dimensions and physics", () => {
    expect(FLAP_MECHANICS).toMatchObject({
      gameHeight: 576,
      gameWidth: 352,
      groundHeight: 64,
      jumpHeight: 48,
      pipeSpawnBuffer: 50,
      pipeSpawnIntervalSeconds: 1.5,
      pipeSpeed: 240,
      timeToApex: 0.35,
    });
    expect(FLAP_GRAVITY).toBeCloseTo(783.673469, 5);
    expect(FLAP_THRUST).toBeCloseTo(274.285714, 5);
    expect(advanceBird(288, -FLAP_THRUST, 0.1)).toEqual({
      velocity: expect.closeTo(-195.918367, 5),
      y: expect.closeTo(268.408163, 5),
    });
  });

  it("generates pipe gaps inside the upstream range", () => {
    expect(createPipeGapCenter(() => 0)).toBe(156);
    expect(createPipeGapCenter(() => 0.5)).toBe(256);
    expect(createPipeGapCenter(() => 0.999)).toBe(355);
  });

  it("detects top pipe, bottom pipe, and ground collisions", () => {
    const pipe = [{ gapCenter: 256, x: 88 }];
    expect(birdCollides(150, pipe)).toBe(true);
    expect(birdCollides(362, pipe)).toBe(true);
    expect(birdCollides(256, pipe)).toBe(false);
    expect(birdCollides(500, [])).toBe(true);
  });

  it("crosses a pipe pair exactly at its shared center", () => {
    expect(pipeCrossedBird(57)).toBe(false);
    expect(pipeCrossedBird(55)).toBe(true);
  });
});
