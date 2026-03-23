import { buildAnimationCode } from "@/components/project/features/studio/tools/animation/templates";

describe("animation templates", () => {
  test("escapes user-controlled strings into valid JavaScript literals", () => {
    const code = buildAnimationCode({
      topic: '磁场 "变化"\n<script>',
      scene: "magnetic_field",
      speed: 75,
      showTrail: true,
      lineColor: '#00ff88";alert(1);//',
    });

    expect(code).toContain('topic: "磁场 \\"变化\\"\\n<script>",');
    expect(code).toContain('scene: "magneticFieldScene",');
    expect(code).toContain('lineColor: "#00ff88\\";alert(1);//",');
  });
});
