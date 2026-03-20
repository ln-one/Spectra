"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ToolPanelShell } from "./ToolPanelShell";
import type { ToolPanelProps } from "./types";

const PPT_OPTIONS = [
  { id: "ppt-001", title: "函数单调性教学课件" },
  { id: "ppt-002", title: "细胞分裂动态演示课件" },
  { id: "ppt-003", title: "大航海时代探究课件" },
];

const SCRIPT_SECTIONS = [
  "开场破冰：用一个生活问题引出今天主题。",
  "过渡语：从定义自然切到图像特征。",
  "互动提问：邀请学生预测结论并说明理由。",
  "总结收束：用一句口诀回顾核心逻辑。",
];

export function SpeakerNotesToolPanel({ toolName }: ToolPanelProps) {
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [highlightTransition, setHighlightTransition] = useState(false);

  const selectedTitle = useMemo(
    () => PPT_OPTIONS.find((item) => item.id === selectedDeck)?.title ?? "",
    [selectedDeck]
  );

  return (
    <ToolPanelShell
      stepTitle={`${toolName}配置`}
      stepDescription="先选择已生成 PPT，再进入提词器视图。当前为界面原型。"
      previewTitle="提词器视图占位"
      previewDescription="左侧缩略图锚点 + 右侧大字号讲稿，支持段落高亮替换。"
      footer={
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">
            {selectedDeck ? `已选择：${selectedTitle}` : "请先选择一份 PPT"}
          </span>
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-lg text-xs"
            disabled={!selectedDeck}
            onClick={() => setHighlightTransition((prev) => !prev)}
          >
            替换第 3 页过渡语
          </Button>
        </div>
      }
      preview={
        !selectedDeck ? (
          <div className="space-y-2">
            {PPT_OPTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedDeck(item.id)}
                className="w-full rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 px-3 py-2 text-left text-xs text-zinc-700"
              >
                选择：{item.title}
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[72px_1fr] gap-3">
            <div className="space-y-2">
              {[1, 2, 3, 4].map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setActivePage(page)}
                  className={`w-full h-12 rounded-md border text-[11px] ${
                    activePage === page
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-zinc-50 text-zinc-600"
                  }`}
                >
                  P{page}
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-[11px] text-zinc-500 mb-2">
                演说模式 · 第 {activePage} 页
              </p>
              <div className="space-y-2">
                {SCRIPT_SECTIONS.map((line, index) => (
                  <p
                    key={line}
                    className={`text-sm leading-6 ${
                      highlightTransition && index === 2
                        ? "bg-violet-100 text-violet-700 rounded px-1.5 py-0.5"
                        : "text-zinc-700"
                    }`}
                  >
                    {line}
                    {index === 1 ? " [动作提示：停顿 3 秒，环顾教室]" : ""}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )
      }
    >
      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
        独立入口规则：仅当选择已有 PPT 后，才显示讲稿视图。
      </section>
    </ToolPanelShell>
  );
}
