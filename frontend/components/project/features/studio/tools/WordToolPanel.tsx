"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ToolPanelShell } from "./ToolPanelShell";
import type { ToolPanelProps } from "./types";

const DOC_TYPES = [
  { id: "layered-plan", label: "分层教案" },
  { id: "student-handout", label: "学生讲义" },
  { id: "homework", label: "课后作业" },
  { id: "lab-guide", label: "实验/实践指导书" },
] as const;

const MODEL_OPTIONS = ["BOPPPS", "5E", "对分课堂"];
const GRADES = ["初一", "初二", "初三", "高一", "高二", "高三"];

export function WordToolPanel({ toolName, onDraftChange }: ToolPanelProps) {
  const [docType, setDocType] =
    useState<(typeof DOC_TYPES)[number]["id"]>("layered-plan");
  const [model, setModel] = useState("BOPPPS");
  const [grade, setGrade] = useState("高一");
  const [difficulty, setDifficulty] = useState("B层");
  const [topic, setTopic] = useState("函数的单调性");

  const docTypeLabel =
    DOC_TYPES.find((item) => item.id === docType)?.label ?? "分层教案";

  useEffect(() => {
    onDraftChange?.({
      doc_type: docType,
      model,
      grade,
      difficulty,
      topic,
    });
  }, [difficulty, docType, grade, model, onDraftChange, topic]);

  const previewMarkdown = useMemo(() => {
    if (docType === "layered-plan") {
      return [
        `# ${topic} - ${docTypeLabel}`,
        `- 教学模型：${model}`,
        `- 受众年级：${grade}`,
        `- 当前层次：${difficulty}`,
        "",
        "## 教学目标",
        "1. 理解概念并建立结构化认知",
        "2. 完成 A/B/C 分层任务设计",
      ].join("\n");
    }

    if (docType === "student-handout") {
      return [
        `# ${topic} - ${docTypeLabel}`,
        `- 目标年级：${grade}`,
        "- 题型：填空 + 引导问题",
        "",
        "## 导学任务",
        "1. 阅读定义并完成关键术语填空",
        "2. 小组讨论：给出一个生活化例子",
      ].join("\n");
    }

    if (docType === "homework") {
      return [
        `# ${topic} - ${docTypeLabel}`,
        `- 适用年级：${grade}`,
        "- 结构：基础题 / 易错题 / 拓展题",
        "",
        "## 示例题",
        "1. 选择题（附详细解析）",
        "2. 应用题（附评分标准）",
      ].join("\n");
    }

    return [
      `# ${topic} - ${docTypeLabel}`,
      `- 面向年级：${grade}`,
      "- 输出内容：步骤拆解 + 安全注意事项",
      "",
      "## 实验流程",
      "1. 设备检查",
      "2. 步骤执行",
      "3. 风险回顾与反思",
    ].join("\n");
  }, [docType, docTypeLabel, difficulty, grade, model, topic]);

  return (
    <ToolPanelShell
      stepTitle={`${toolName}配置`}
      stepDescription="先选文档类型，再进行二级参数配置。当前仅为交互界面。"
      previewTitle="Markdown 预览占位"
      previewDescription="这里模拟生成后的文档预览，后续将替换为真实返回结果。"
      footer={
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">
            可在中栏 Chat 继续微调文案（后续接入）。
          </span>
          <Button size="sm" className="h-8 rounded-lg" disabled>
            生成文档（即将接入）
          </Button>
        </div>
      }
      preview={
        <pre className="text-xs leading-5 text-zinc-700 whitespace-pre-wrap">
          {previewMarkdown}
        </pre>
      }
    >
      <section className="space-y-2">
        <Label className="text-xs text-zinc-600">第一步：文档类型</Label>
        <div className="grid grid-cols-2 gap-2">
          {DOC_TYPES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDocType(item.id)}
              className={`rounded-lg border px-2 py-2 text-xs text-left transition-colors ${
                docType === item.id
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <Label className="text-xs text-zinc-600">第二步：深度配置</Label>
        <div className="grid grid-cols-1 gap-2">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-zinc-500">主题</Label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          {docType === "layered-plan" ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-zinc-500">教学模型</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-zinc-500">梯度层次</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A层">A层（基础巩固）</SelectItem>
                    <SelectItem value="B层">B层（综合应用）</SelectItem>
                    <SelectItem value="C层">C层（探究提升）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}

          <div className="space-y-1.5">
            <Label className="text-[11px] text-zinc-500">受众年级</Label>
            <Select value={grade} onValueChange={setGrade}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRADES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>
    </ToolPanelShell>
  );
}
