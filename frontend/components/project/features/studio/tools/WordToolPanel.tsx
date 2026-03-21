"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookText,
  CircleCheck,
  Download,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Settings2,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ToolPanelProps } from "./types";

type WordStep = "config" | "generate" | "preview";

const DOC_TYPES = [
  {
    id: "layered-plan",
    label: "分层教案",
    helper: "按不同学习层次准备 A/B/C 任务。",
  },
  {
    id: "student-handout",
    label: "学生讲义",
    helper: "面向学生发放的课堂资料和练习页。",
  },
  {
    id: "homework",
    label: "课后练习",
    helper: "课后巩固与拓展题单。",
  },
  {
    id: "lab-guide",
    label: "实验指导",
    helper: "强调步骤、注意事项和复盘。",
  },
] as const;

const MODEL_OPTIONS = ["BOPPPS", "5E", "对分课堂"] as const;
const GRADES = ["初一", "初二", "初三", "高一", "高二", "高三"] as const;
const LAYERS = [
  { value: "A层", label: "A层（基础巩固）" },
  { value: "B层", label: "B层（综合应用）" },
  { value: "C层", label: "C层（探究提升）" },
] as const;

const STEP_META: Array<{
  id: WordStep;
  title: string;
  desc: string;
  icon: typeof Settings2;
}> = [
  {
    id: "config",
    title: "1. 配置",
    desc: "告诉系统你要哪类文档",
    icon: Settings2,
  },
  {
    id: "generate",
    title: "2. 生成",
    desc: "确认参数并开始生成",
    icon: WandSparkles,
  },
  {
    id: "preview",
    title: "3. 预览",
    desc: "在当前面板查看结果",
    icon: Eye,
  },
];

function statusLabel(status?: string | null): string {
  if (status === "ready") return "可直接生成";
  if (status === "foundation_ready") return "基础能力可用";
  if (status === "protocol_pending") return "能力准备中";
  return "状态加载中";
}

export function WordToolPanel({
  toolName,
  onDraftChange,
  flowContext,
}: ToolPanelProps) {
  const [activeStep, setActiveStep] = useState<WordStep>("config");
  const [docType, setDocType] =
    useState<(typeof DOC_TYPES)[number]["id"]>("layered-plan");
  const [model, setModel] = useState<(typeof MODEL_OPTIONS)[number]>("BOPPPS");
  const [grade, setGrade] = useState<(typeof GRADES)[number]>("高一");
  const [difficulty, setDifficulty] = useState("B层");
  const [topic, setTopic] = useState("函数的单调性");
  const [goal, setGoal] = useState("帮助学生理解单调区间并能解决典型例题。");
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  const docTypeMeta = useMemo(
    () => DOC_TYPES.find((item) => item.id === docType) ?? DOC_TYPES[0],
    [docType]
  );

  useEffect(() => {
    onDraftChange?.({
      doc_type: docType,
      model,
      grade,
      difficulty,
      topic,
      goal,
      source_artifact_id: flowContext?.selectedSourceId ?? null,
    });
  }, [
    difficulty,
    docType,
    flowContext?.selectedSourceId,
    goal,
    grade,
    model,
    onDraftChange,
    topic,
  ]);

  const previewMarkdown = useMemo(() => {
    if (docType === "layered-plan") {
      return [
        `# ${topic} · ${docTypeMeta.label}`,
        "",
        "## 课程定位",
        `- 适用年级：${grade}`,
        `- 教学模型：${model}`,
        `- 当前分层：${difficulty}`,
        `- 教学目标：${goal}`,
        "",
        "## 课堂结构（45分钟）",
        "1. 导入（5分钟）：用生活场景引入核心概念。",
        "2. 讲解（18分钟）：梳理定义、图像和判断方法。",
        `3. 分层任务（15分钟）：${difficulty}任务单 + 小组讲评。`,
        "4. 回顾（7分钟）：总结常见误区并布置巩固练习。",
        "",
        "## 分层任务示例",
        "- A层：完成概念判断和基础题。",
        "- B层：处理综合例题并解释思路。",
        "- C层：设计变式题并进行同伴讲解。",
      ].join("\n");
    }

    if (docType === "student-handout") {
      return [
        `# ${topic} · ${docTypeMeta.label}`,
        "",
        "## 学习目标",
        `- 面向：${grade}`,
        `- 目标：${goal}`,
        "",
        "## 课堂学习单",
        "1. 关键概念填空",
        "2. 例题步骤拆解",
        "3. 同伴讨论题",
        "",
        "## 课后自查",
        "- 我能否独立判断函数的单调区间？",
        "- 我能否解释每一步推理理由？",
      ].join("\n");
    }

    if (docType === "homework") {
      return [
        `# ${topic} · ${docTypeMeta.label}`,
        "",
        "## 作业结构",
        `- 适用年级：${grade}`,
        `- 教学目标：${goal}`,
        "- 基础题 4 道 + 提升题 3 道 + 拓展题 1 道",
        "",
        "## 评分建议",
        "1. 计算过程完整性",
        "2. 推理表达清晰度",
        "3. 易错点自我修正",
      ].join("\n");
    }

    return [
      `# ${topic} · ${docTypeMeta.label}`,
      "",
      "## 实验准备",
      `- 面向年级：${grade}`,
      `- 教学目标：${goal}`,
      "- 材料清单与安全提示",
      "",
      "## 实验步骤",
      "1. 环境检查与分组",
      "2. 按步骤操作并记录数据",
      "3. 结果复盘与误差分析",
    ].join("\n");
  }, [difficulty, docType, docTypeMeta.label, goal, grade, model, topic]);

  const handleGenerate = async () => {
    if (!flowContext?.onExecute) {
      setLastGeneratedAt(new Date().toISOString());
      setActiveStep("preview");
      return;
    }

    setIsGenerating(true);
    try {
      await flowContext.onExecute();
      setLastGeneratedAt(new Date().toISOString());
      setActiveStep("preview");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-full overflow-hidden rounded-2xl border border-zinc-200 bg-[linear-gradient(160deg,#ffffff,#f8fafc)] shadow-[0_22px_65px_-48px_rgba(15,23,42,0.45)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-zinc-200 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">
                {toolName}三步工作台
              </h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                先配置，再生成，最后在当前面板直接预览，不跳转页面。
              </p>
            </div>
            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] text-zinc-600">
              {statusLabel(flowContext?.readiness)}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {STEP_META.map((step) => {
              const Icon = step.icon;
              const active = activeStep === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStep(step.id)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left transition-colors",
                    active
                      ? "border-blue-500 bg-blue-50"
                      : "border-zinc-200 bg-white hover:bg-zinc-50"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5",
                        active ? "text-blue-600" : "text-zinc-500"
                      )}
                    />
                    <p
                      className={cn(
                        "text-xs font-semibold",
                        active ? "text-blue-700" : "text-zinc-700"
                      )}
                    >
                      {step.title}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">{step.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {activeStep === "config" ? (
            <div className="space-y-4">
              <section className="rounded-xl border border-zinc-200 bg-white p-3">
                <p className="text-xs font-medium text-zinc-700">文档类型</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  先选择要生成什么文档，后面参数会自动匹配。
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {DOC_TYPES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setDocType(item.id)}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left transition-colors",
                        docType === item.id
                          ? "border-blue-500 bg-blue-50"
                          : "border-zinc-200 bg-white hover:bg-zinc-50"
                      )}
                    >
                      <p className="text-xs font-semibold text-zinc-800">
                        {item.label}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {item.helper}
                      </p>
                    </button>
                  ))}
                </div>
              </section>

              <section className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs text-zinc-600">课题名称</Label>
                  <Input
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-600">适用年级</Label>
                  <Select
                    value={grade}
                    onValueChange={(value) =>
                      setGrade(value as (typeof GRADES)[number])
                    }
                  >
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
                {docType === "layered-plan" ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-600">教学模型</Label>
                    <Select
                      value={model}
                      onValueChange={(value) =>
                        setModel(value as (typeof MODEL_OPTIONS)[number])
                      }
                    >
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
                ) : null}
                {docType === "layered-plan" ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-600">分层难度</Label>
                    <Select value={difficulty} onValueChange={setDifficulty}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LAYERS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs text-zinc-600">教学目标</Label>
                  <Input
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </section>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="h-9 rounded-lg bg-blue-600 text-xs hover:bg-blue-500"
                  onClick={() => setActiveStep("generate")}
                >
                  下一步：确认生成
                </Button>
              </div>
            </div>
          ) : null}

          {activeStep === "generate" ? (
            <div className="space-y-4">
              <section className="rounded-xl border border-zinc-200 bg-white p-3">
                <p className="text-xs font-semibold text-zinc-800">生成前确认</p>
                <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] text-zinc-600 sm:grid-cols-2">
                  <p>文档类型：{docTypeMeta.label}</p>
                  <p>适用年级：{grade}</p>
                  <p>课题：{topic}</p>
                  {docType === "layered-plan" ? <p>教学模型：{model}</p> : null}
                  {docType === "layered-plan" ? (
                    <p>分层：{difficulty}</p>
                  ) : null}
                </div>
              </section>

              <section className="rounded-xl border border-zinc-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-zinc-800">
                      源成果绑定
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {flowContext?.requiresSourceArtifact
                        ? "这个卡片需要绑定一个已有成果后才能执行。"
                        : "可选：绑定一个已有成果，让生成更贴近你的项目语境。"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => void flowContext?.onLoadSources?.()}
                    disabled={
                      flowContext?.isLoadingProtocol ||
                      flowContext?.isActionRunning
                    }
                  >
                    {flowContext?.isActionRunning ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    刷新可用成果
                  </Button>
                </div>
                {flowContext?.sourceOptions &&
                flowContext.sourceOptions.length > 0 ? (
                  <div className="mt-3">
                    <Select
                      value={flowContext.selectedSourceId ?? ""}
                      onValueChange={(value) =>
                        flowContext.onSelectedSourceChange?.(value || null)
                      }
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="请选择一个已生成成果" />
                      </SelectTrigger>
                      <SelectContent>
                        {flowContext.sourceOptions.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {(item.title || item.id.slice(0, 8)) +
                              (item.type ? ` (${item.type})` : "")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] text-zinc-500">
                    当前还没有可绑定成果，点击上方按钮可刷新。
                  </p>
                )}
              </section>

              {flowContext?.isProtocolPending ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  当前能力还在准备中，请稍后再试。
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 text-xs text-zinc-600"
                  onClick={() => setActiveStep("config")}
                >
                  返回修改配置
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 rounded-lg bg-blue-600 text-xs hover:bg-blue-500"
                  disabled={
                    isGenerating ||
                    Boolean(flowContext?.isActionRunning) ||
                    Boolean(flowContext?.isLoadingProtocol) ||
                    flowContext?.canExecute === false
                  }
                  onClick={() => void handleGenerate()}
                >
                  {isGenerating || flowContext?.isActionRunning ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      正在生成文档...
                    </>
                  ) : (
                    <>
                      <WandSparkles className="mr-1.5 h-3.5 w-3.5" />
                      开始生成
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : null}

          {activeStep === "preview" ? (
            <div className="space-y-4">
              <section className="rounded-xl border border-zinc-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CircleCheck className="h-4 w-4 text-emerald-600" />
                    <div>
                      <p className="text-xs font-semibold text-zinc-800">
                        文档预览（面板内）
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {lastGeneratedAt
                          ? `最近一次生成：${new Date(lastGeneratedAt).toLocaleString()}`
                          : "当前展示的是根据配置生成的预览稿。"}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setActiveStep("generate")}
                  >
                    重新生成
                  </Button>
                </div>

                <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
                  <article className="prose prose-zinc max-w-none text-sm leading-6 prose-headings:mb-2 prose-headings:mt-4 prose-p:my-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {previewMarkdown}
                    </ReactMarkdown>
                  </article>
                </div>
              </section>

              <section className="rounded-xl border border-zinc-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <BookText className="h-4 w-4 text-zinc-600" />
                    <p className="text-xs font-semibold text-zinc-800">
                      最近生成成果
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-zinc-600"
                    onClick={() => void flowContext?.onRefine?.()}
                    disabled={!flowContext?.canRefine}
                  >
                    继续润色
                  </Button>
                </div>

                <div className="mt-2 space-y-2">
                  {flowContext?.latestArtifacts &&
                  flowContext.latestArtifacts.length > 0 ? (
                    flowContext.latestArtifacts.slice(0, 4).map((item) => (
                      <div
                        key={item.artifactId}
                        className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-zinc-800">
                            {item.title}
                          </p>
                          <p className="mt-1 text-[11px] text-zinc-500">
                            {new Date(item.createdAt).toLocaleString()} ·{" "}
                            {item.status}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0 text-xs"
                          onClick={() =>
                            void flowContext.onExportArtifact?.(item.artifactId)
                          }
                        >
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          下载
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3 text-[11px] text-zinc-500">
                      还没有历史成果。你可以先点击“重新生成”，完成后会出现在这里。
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : null}
        </div>

        <div className="border-t border-zinc-200 bg-white px-4 py-2">
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <FileText className="h-3.5 w-3.5 text-zinc-400" />
            你也可以在右上角 Chat 里用自然语言继续微调文档内容。
          </div>
        </div>
      </div>
    </div>
  );
}
