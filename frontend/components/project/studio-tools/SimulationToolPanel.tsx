"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToolPanelShell } from "./ToolPanelShell";
import type { ToolPanelProps } from "./types";

const STUDENTS = [
  { id: "stu-1", name: "小林", tag: "喜欢钻牛角尖的差生" },
  { id: "stu-2", name: "小周", tag: "思维发散的优等生" },
  { id: "stu-3", name: "小许", tag: "关注细节的理科生" },
];

const QUESTION_POOL = [
  "老师，既然惯性是物体属性，为什么质量越大越难刹住？",
  "上一页公式推导里为什么要先做这个近似？",
  "如果边界条件变化，结论还成立吗？",
];

const STRATEGY_POOL = [
  "先共情再纠偏：先肯定问题敏锐度，再拆分概念边界。",
  "从反例切入：给出一个极端情形让学生自行检验逻辑。",
  "双层回答：先给直觉解释，再给规范术语版本。",
];

export function SimulationToolPanel({ toolName }: ToolPanelProps) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [judgeText, setJudgeText] = useState("");
  const [showStrategies, setShowStrategies] = useState(false);
  const [strategyOffset, setStrategyOffset] = useState(0);

  const currentQuestion = useMemo(
    () => QUESTION_POOL[questionIndex % QUESTION_POOL.length],
    [questionIndex]
  );

  const visibleStrategies = useMemo(
    () => [
      STRATEGY_POOL[(strategyOffset + 0) % STRATEGY_POOL.length],
      STRATEGY_POOL[(strategyOffset + 1) % STRATEGY_POOL.length],
      STRATEGY_POOL[(strategyOffset + 2) % STRATEGY_POOL.length],
    ],
    [strategyOffset]
  );

  return (
    <ToolPanelShell
      stepTitle={`${toolName}配置`}
      stepDescription="模拟课前沙盘推演：虚拟学生提问、教师作答、裁判点评。"
      previewTitle="虚拟课堂群聊占位"
      previewDescription="支持下一轮提问与“棱镜锦囊”策略展示。"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-lg text-xs"
            onClick={() => setQuestionIndex((prev) => prev + 1)}
          >
            下一轮提问
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-lg text-xs"
            onClick={() => {
              setShowStrategies(true);
              setStrategyOffset((prev) => prev + 1);
            }}
          >
            棱镜锦囊
          </Button>
        </div>
      }
      preview={
        <div className="space-y-3">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 space-y-2">
            {STUDENTS.map((student) => (
              <div key={student.id} className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-zinc-200 text-[10px] flex items-center justify-center">
                  {student.name.slice(-1)}
                </div>
                <span className="text-xs text-zinc-700">{student.name}</span>
                <span className="text-[10px] text-zinc-500">
                  [{student.tag}]
                </span>
              </div>
            ))}
            <div className="rounded-md bg-white border border-zinc-200 p-2 text-xs text-zinc-700">
              学生提问：{currentQuestion}
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="在这里输入教师回答..."
              className="h-9 text-xs"
            />
            <Button
              type="button"
              size="sm"
              className="h-9 text-xs"
              onClick={() =>
                setJudgeText(
                  answer.trim()
                    ? "裁判评价：回答结构清晰，可再补充一个反例增强说服力。"
                    : ""
                )
              }
            >
              提交作答
            </Button>
          </div>

          {judgeText ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-700">
              {judgeText}
            </div>
          ) : null}

          {showStrategies ? (
            <div className="space-y-2">
              {visibleStrategies.map((item) => (
                <div
                  key={item}
                  className="rounded-md border border-violet-300 bg-violet-50 p-2 text-xs text-violet-700"
                >
                  {item}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      }
    >
      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
        可通过中栏 Chat 指令调整提问方向（本轮不接联动，仅展示入口意图）。
      </section>
    </ToolPanelShell>
  );
}
