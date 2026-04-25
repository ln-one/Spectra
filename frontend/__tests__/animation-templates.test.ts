import {
  ANIMATION_RHYTHM_OPTIONS,
  ANIMATION_STEPS,
  resolveDefaultExplainerStylePack,
} from "@/components/project/features/studio/tools/animation/constants";

describe("animation workflow config", () => {
  test("keeps contract-first workflow steps", () => {
    expect(ANIMATION_STEPS.map((item) => item.id)).toEqual([
      "config",
      "generate",
      "preview",
    ]);
    expect(ANIMATION_STEPS[1]?.description).toContain("正式输出格式");
    expect(ANIMATION_STEPS[2]?.description).toContain("placement");
  });

  test("exposes slow balanced fast rhythm options", () => {
    expect(ANIMATION_RHYTHM_OPTIONS.map((item) => item.value)).toEqual([
      "slow",
      "balanced",
      "fast",
    ]);
  });

  test("defaults explainer style to a clean white-background theme", () => {
    expect(resolveDefaultExplainerStylePack()).toBe("teaching_ppt_fresh_green");
  });
});
