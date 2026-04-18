import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";
import { PreviewStep } from "@/components/project/features/studio/tools/simulation/PreviewStep";

function buildFlowContext(overrides: Partial<ToolFlowContext> = {}): ToolFlowContext {
  return {
    capabilityStatus: "backend_ready",
    capabilityReason: "Loaded backend classroom simulation content.",
    supportsChatRefine: true,
    display: {
      toolId: "handout",
      productTitle: "学情预演",
      productDescription: "围绕真实课堂预演结果统一展示当前轮焦点。",
      studioCardId: "classroom_qa_simulator",
      actionLabels: {
        preview: "执行预检",
        loadSources: "刷新来源",
        execute: "开始课堂预演",
        refine: "调整追问方向",
      },
      sourceBinding: {
        required: "必选：请先绑定一个来源成果。",
        optional: "可选：绑定已有成果后，预演提问会更贴近当前项目上下文。",
        empty: "当前还没有可绑定成果，点击上方按钮即可刷新。",
      },
    },
    resolvedArtifact: {
      artifactId: "sim-artifact-1",
      artifactType: "handout",
      contentKind: "json",
      content: {
        summary: "学生会重点追问受力分析中的方向判断。",
        question_focus: "区分合力方向与速度方向",
        turns: [
          {
            turn_anchor: "turn-1",
            student_profile: "细节型理科生",
            student_question: "如果速度向右，合力一定向右吗？",
            teacher_answer: "先拆开速度方向和合力方向。",
            feedback: "先区分速度方向与加速度方向，再回到牛顿第二定律。",
            score: 82,
            next_focus: "减速与加速度方向关系",
            teacher_hint: "先用反例帮助学生拆开两个概念。",
          },
          {
            turn_anchor: "turn-2",
            student_profile: "细节型理科生",
            student_question: "那减速时加速度方向如何判断？",
            teacher_answer: "看速度变化趋势，再判断加速度方向。",
            feedback: "可以让学生自己给出一个反例。",
            score: 88,
            next_focus: "反例构造",
          },
        ],
      },
    },
    latestArtifacts: [{ artifactId: "sim-artifact-1", title: "课堂预演", status: "completed", createdAt: "2026-04-17T08:00:00.000Z" }],
    ...overrides,
  };
}

describe("simulation preview", () => {
  it("shows current focus, backend turn, history and refine entry", async () => {
    const onRefine = jest.fn();
    const onSubmitAnswer = jest.fn();
    const onRefineStart = jest.fn();
    const onResumeResult = jest.fn();

    render(
      <PreviewStep
        answer="先看一个向右运动但向左减速的例子。"
        judgeText=""
        lastGeneratedAt={"2026-04-17T08:00:00.000Z"}
      flowContext={buildFlowContext({ onRefine })}
        turnRuntimeState={{ next_action: "follow_up_turn" }}
        turnResult={{
          turnAnchor: "turn-3",
          studentQuestion: "那减速时加速度方向如何判断？",
          score: 88,
          nextFocus: "让学生解释减速与加速度方向关系",
        }}
        onRefineStart={onRefineStart}
        onResumeResult={onResumeResult}
        onAnswerChange={() => undefined}
        onSubmitAnswer={onSubmitAnswer}
      />
    );

    expect(screen.getByText("课堂预演")).toBeInTheDocument();
    expect(screen.getByText("多轮课堂预演工作面")).toBeInTheDocument();
    expect(screen.getByText("当前轮焦点：让学生解释减速与加速度方向关系")).toBeInTheDocument();
    expect(screen.getByText("当前建议动作：继续追问，推进下一轮课堂预演。")).toBeInTheDocument();
    expect(screen.getByText("当前学生画像：细节型理科生")).toBeInTheDocument();
    expect(screen.getAllByText("turn-2")).toHaveLength(2);
    expect(screen.getByText("上一轮教师回应：看速度变化趋势，再判断加速度方向。")).toBeInTheDocument();
    expect(screen.getByText("新一轮学生提问：那减速时加速度方向如何判断？")).toBeInTheDocument();
    expect(screen.getByText("轮次历史")).toBeInTheDocument();
    expect(screen.getByText("教师回应：先拆开速度方向和合力方向。")).toBeInTheDocument();
    expect(screen.getByText("反馈：先区分速度方向与加速度方向，再回到牛顿第二定律。")).toBeInTheDocument();
    expect(screen.getByText("当前轮续接锚点")).toBeInTheDocument();
    expect(screen.getByText("turn-3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "调整追问方向" }));
    fireEvent.click(screen.getByRole("button", { name: "提交回应" }));

    expect(onRefine).toHaveBeenCalledTimes(1);
    expect(onRefineStart).toHaveBeenCalledTimes(1);
    expect(onSubmitAnswer).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(onResumeResult).toHaveBeenCalledTimes(1);
    });
  });
});
