import {
  ANIMATION_RHYTHM_OPTIONS,
  ANIMATION_STEPS,
} from "@/components/project/features/studio/tools/animation/constants";

describe("animation workflow config", () => {
  test("keeps GIF-first workflow steps", () => {
    expect(ANIMATION_STEPS.map((item) => item.id)).toEqual([
      "config",
      "generate",
      "preview",
    ]);
    expect(ANIMATION_STEPS[1]?.description).toContain("GIF");
  });

  test("exposes slow balanced fast rhythm options", () => {
    expect(ANIMATION_RHYTHM_OPTIONS.map((item) => item.value)).toEqual([
      "slow",
      "balanced",
      "fast",
    ]);
  });
});
