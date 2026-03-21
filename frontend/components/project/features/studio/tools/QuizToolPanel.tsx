"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ToolPanelShell } from "./ToolPanelShell";
import type { ToolPanelProps } from "./types";

interface QuizItem {
  id: string;
  question: string;
  options: string[];
  answerIndex: number;
  explainCorrect: string;
  explainWrong: string;
}

const QUIZ_BANK: QuizItem[] = [
  {
    id: "q1",
    question: "函数 y=x^2 在 x=0 附近的单调性如何？",
    options: ["严格递增", "先减后增", "严格递减", "保持不变"],
    answerIndex: 1,
    explainCorrect: "x^2 在负半轴递减、正半轴递增，x=0 是最小值点。",
    explainWrong: "易错点在于把“整体趋势”误当作“局部全程递增”。",
  },
  {
    id: "q2",
    question: "下列哪个是课堂即时测验最合适的题型？",
    options: ["20分钟大题", "单题概念判断", "整套期末卷", "纯记忆填空"],
    answerIndex: 1,
    explainCorrect: "随堂小测强调即时反馈，单题判断更适合快速诊断。",
    explainWrong: "该选项难以在课堂节奏内完成即时反馈闭环。",
  },
  {
    id: "q3",
    question: "若要提升辨析能力，更推荐哪类追问？",
    options: ["背定义", "解释错因", "抄答案", "重复题干"],
    answerIndex: 1,
    explainCorrect: "解释错因能暴露思维路径，便于精准纠错。",
    explainWrong: "仅复述结果无法定位学生的认知偏差来源。",
  },
];

export function QuizToolPanel({ toolName, onDraftChange }: ToolPanelProps) {
  const [scope, setScope] = useState("函数单调性与极值");
  const [count, setCount] = useState("5");
  const [cursor, setCursor] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [bankVersion, setBankVersion] = useState(0);

  const current = useMemo(
    () => QUIZ_BANK[(cursor + bankVersion) % QUIZ_BANK.length],
    [cursor, bankVersion]
  );

  useEffect(() => {
    onDraftChange?.({
      scope,
      count,
      cursor,
      question_id: current.id,
      question: current.question,
    });
  }, [count, current.id, current.question, cursor, onDraftChange, scope]);

  const isCorrect = selectedIndex === current.answerIndex;

  return (
    <ToolPanelShell
      stepTitle={`${toolName}配置`}
      stepDescription="输入考察范围后进入单题闪卡模式，当前为纯前端交互。"
      previewTitle="沉浸式闪卡预览"
      previewDescription="点击选项后立即展示解析，再切换下一题。"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg text-xs"
            onClick={() => {
              setSelectedIndex(null);
              setBankVersion((prev) => prev + 1);
            }}
          >
            重新生成当前题
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-lg text-xs"
            onClick={() => {
              setSelectedIndex(null);
              setCursor((prev) => (prev + 1) % QUIZ_BANK.length);
            }}
          >
            下一题 →
          </Button>
        </div>
      }
      preview={
        <div className="space-y-3">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">
              第 {(cursor % QUIZ_BANK.length) + 1} 题
            </p>
            <p className="text-sm font-medium text-zinc-800 mt-1">
              {current.question}
            </p>
          </div>
          <div className="space-y-2">
            {current.options.map((option, index) => {
              const selected = selectedIndex === index;
              const shouldHighlight =
                selectedIndex !== null && index === current.answerIndex;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={`w-full rounded-lg border px-3 py-2 text-xs text-left transition-colors ${
                    selected
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : shouldHighlight
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  {String.fromCharCode(65 + index)}. {option}
                </button>
              );
            })}
          </div>
          {selectedIndex !== null ? (
            <div
              className={`rounded-lg border p-3 text-xs ${
                isCorrect
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-amber-300 bg-amber-50 text-amber-700"
              }`}
            >
              {isCorrect ? current.explainCorrect : current.explainWrong}
            </div>
          ) : null}
        </div>
      }
    >
      <section className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-[11px] text-zinc-500">考察范围</Label>
          <Input
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="h-9 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-zinc-500">题量</Label>
          <Input
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="h-9 text-xs"
          />
        </div>
      </section>
    </ToolPanelShell>
  );
}
