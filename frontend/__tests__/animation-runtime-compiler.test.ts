import React from "react";
import { TextDecoder, TextEncoder } from "util";
import { compileAnimationComponent } from "@/components/project/features/studio/tools/animation/runtime/compiler";
import { PlaybackProvider } from "@/components/project/features/studio/tools/animation/runtime/runtimeApi";
import { compileRuntimePlan } from "@/components/project/features/studio/tools/animation/runtime/runtimePlan";

if (typeof global.TextEncoder === "undefined") {
  // jsdom in this test environment does not always expose encoder globals.
  global.TextEncoder = TextEncoder as typeof global.TextEncoder;
}

if (typeof global.TextDecoder === "undefined") {
  global.TextDecoder = TextDecoder as typeof global.TextDecoder;
}

const { renderToStaticMarkup } = require("react-dom/server");

describe("animation runtime compiler", () => {
  it("compiles controlled runtime code", () => {
    const result = compileAnimationComponent(`
export default function Animation(runtimeProps) {
  const e = React.createElement;
  const playback = usePlayback();
  return e(Stage, { title: "Runtime Demo", subtitle: "ok", theme: runtimeProps.theme },
    e(Scene, { title: "Scene 1", summary: "Summary" },
      e(Caption, { title: playback.isPlaying ? "playing" : "paused", body: "Demo" }),
      e(Track, { items: [{ id: "item-0", label: "#0", value: 3, accent: "active" }], maxValue: 3 })
    )
  );
}
    `);

    expect(result.ok).toBe(true);
    expect(result.component).not.toBeNull();
  });

  it("rejects disallowed browser globals", () => {
    const result = compileAnimationComponent(`
export default function Animation() {
  return window.alert("bad");
}
    `);

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.message).toContain("Window access");
  });

  it("rejects code without a default export", () => {
    const result = compileAnimationComponent(`
function Animation() {
  return null;
}
    `);

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.message).toContain("export default function");
  });

  it("rejects unsupported runtime APIs", () => {
    const result = compileAnimationComponent(`
export default function Animation() {
  const playback = usePlayback();
  return React.createElement(Stage, null,
    React.createElement(Scene, null,
      React.createElement(Track, {
        items: [{ id: "a", label: "#0", value: 1 }],
        maxValue: 1
      }),
      React.createElement(Caption, { title: "demo", body: String(playback.jumpTo(2)) })
    )
  );
}
    `);

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.ruleId).toBe("no-unsupported-runtime-api");
  });

  it("rejects invalid primitive props and missing track items", () => {
    const result = compileAnimationComponent(`
export default function Animation() {
  return React.createElement(Stage, null,
    React.createElement(Scene, null,
      React.createElement(Caption, { content: "bad" }),
      React.createElement(Track, { mode: "bars" })
    )
  );
}
    `);

    expect(result.ok).toBe(false);
    expect(result.errors.some((item) => item.ruleId === "caption-props-only")).toBe(true);
    expect(result.errors.some((item) => item.ruleId === "require-track-items")).toBe(true);
  });

  it("rejects invalid track mode literals", () => {
    const result = compileAnimationComponent(`
export default function Animation() {
  return React.createElement(Stage, null,
    React.createElement(Scene, null,
      React.createElement(Track, {
        items: [{ id: "a", label: "#0", value: 1 }],
        maxValue: 1,
        mode: "bar"
      })
    )
  );
}
    `);

    expect(result.ok).toBe(false);
    expect(result.errors.some((item) => item.ruleId === "track-mode-invalid")).toBe(true);
  });

  it("rejects used_primitives mismatches", () => {
    const result = compileAnimationComponent(
      `
export default function Animation() {
  return React.createElement(Stage, null,
    React.createElement(Scene, null,
      React.createElement(Caption, { title: "demo" }),
      React.createElement(Track, {
        items: [{ id: "a", label: "#0", value: 1 }],
        maxValue: 1
      })
    )
  );
}
      `,
      { expectedUsedPrimitives: ["Stage", "Scene", "Caption"] }
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.ruleId).toBe("used-primitives-must-match-ast");
  });

  it("renders deterministic runtime-plan code without TDZ failures", () => {
    const source = compileRuntimePlan({
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
            { id: "item-0", label: "#0", value: 5, accent: "active" },
            { id: "item-1", label: "#1", value: 3, accent: "swap" },
          ],
          max_value: 5,
        },
      ],
      bindings: { step_index_source: "playback.stepIndex" },
      layout: { subject_position: "center", caption_position: "bottom" },
      caption_strategy: { mode: "single_caption" },
      subject: { kind: "track", track_mode: "bars" },
      used_primitives: ["Stage", "Scene", "Track", "Caption", "usePlayback"],
    });

    const result = compileAnimationComponent(source, {
      expectedUsedPrimitives: ["Stage", "Scene", "Track", "Caption", "usePlayback"],
    });

    expect(result.ok).toBe(true);
    expect(result.component).not.toBeNull();

    const markup = renderToStaticMarkup(
      React.createElement(
        PlaybackProvider,
        {
          value: {
            isPlaying: true,
            stepIndex: 0,
            totalSteps: 1,
            globalProgress: 0,
            sceneIndex: 0,
            sceneProgress: 0,
            playbackSpeed: 1,
          },
        },
        result.component
          ? React.createElement(result.component, {
              theme: {
                background: "#111827",
                accent: "#38bdf8",
                text: "#ffffff",
              },
            })
          : null
      )
    );

    expect(markup).toContain("当前比较");
  });
});
