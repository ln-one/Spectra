import {
  compileRuntimePlan,
  validateRuntimePlan,
} from "@/components/project/features/studio/tools/animation/runtime/runtimePlan";

describe("animation runtime plan", () => {
  const validPlan = {
    title: "冒泡排序演示动画",
    summary: "通过动画理解比较与交换。",
    family_hint: "algorithm_demo",
    scene_outline: [{ title: "比较与交换", summary: "观察数组状态" }],
    timeline: { total_steps: 1 },
    steps: [
      {
        caption_title: "当前比较",
        caption_body: "先比较 5 和 3。",
        items: [
          { id: "item-0", label: "#0", value: 5, accent: "active" as const },
          { id: "item-1", label: "#1", value: 3, accent: "swap" as const },
        ],
        max_value: 5,
      },
    ],
    bindings: { step_index_source: "playback.stepIndex" as const },
    layout: { subject_position: "center" as const, caption_position: "bottom" as const },
    caption_strategy: { mode: "single_caption" as const },
    subject: { kind: "track" as const, track_mode: "bars" as const },
    used_primitives: ["Stage", "Scene", "Track", "Caption", "usePlayback"],
  };

  it("validates an algorithm_demo plan", () => {
    expect(validateRuntimePlan(validPlan)).toEqual([]);
  });

  it("rejects invalid track mode and track item props", () => {
    const errors = validateRuntimePlan({
      ...validPlan,
      subject: { kind: "track", track_mode: "bar" as "bars" },
      steps: [
        {
          ...validPlan.steps[0],
          items: [
            {
              id: "item-0",
              label: "#0",
              value: 5,
              accent: "active",
              isActive: true,
            } as unknown as (typeof validPlan.steps)[number]["items"][number],
          ],
        },
      ],
    });

    expect(errors.some((item) => item.ruleId === "runtime-plan-track-mode")).toBe(true);
    expect(
      errors.some((item) => item.ruleId === "runtime-plan-track-item-props")
    ).toBe(true);
  });

  it("compiles a valid runtime plan into deterministic code", () => {
    const code = compileRuntimePlan(validPlan);
    expect(code).toContain("export default function Animation(runtimeProps)");
    expect(code).toContain('mode: "bars"');
    expect(code).toContain("usePlayback()");
  });
});
