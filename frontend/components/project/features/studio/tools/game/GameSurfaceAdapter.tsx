"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, HelpCircle, KeyRound, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkbenchCenteredState } from "../WorkbenchCenteredState";
import type { InteractiveGamePayload, InteractiveGameSubtype } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function normalizeSubtype(value: unknown): InteractiveGameSubtype | null {
  if (
    value === "drag_classification" ||
    value === "sequence_sort" ||
    value === "relationship_link"
  ) {
    return value;
  }
  return null;
}

function parseLegacyGamePayload(
  parsed: Record<string, unknown>
): InteractiveGamePayload {
  const html =
    typeof parsed.html === "string" && parsed.html.trim()
      ? parsed.html.trim()
      : typeof parsed.content_html === "string" && parsed.content_html.trim()
        ? parsed.content_html.trim()
        : null;
  return {
    schemaId: "interactive_game.legacy",
    subtype: null,
    title:
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim()
        : "互动游戏",
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : null,
    subtitle: null,
    teachingGoal: null,
    teacherNotes: [],
    instructions: [],
    scorePolicy: {},
    completionRule: {},
    answerKey: null,
    spec: {},
    runtime: {
      html,
      sandboxVersion: null,
      assets: [],
    },
    sourceBinding: isRecord(parsed.source_binding) ? parsed.source_binding : null,
    provenance: isRecord(parsed.provenance) ? parsed.provenance : null,
  };
}

export function parseGamePayload(rawContent: unknown): InteractiveGamePayload {
  let parsed: Record<string, unknown> | null = null;
  if (isRecord(rawContent)) {
    parsed = rawContent;
  } else if (typeof rawContent === "string" && rawContent.trim().startsWith("{")) {
    try {
      const candidate = JSON.parse(rawContent);
      parsed = isRecord(candidate) ? candidate : null;
    } catch {
      parsed = null;
    }
  }

  if (!parsed) {
    return {
      schemaId: null,
      subtype: null,
      title: null,
      summary: null,
      subtitle: null,
      teachingGoal: null,
      teacherNotes: [],
      instructions: [],
      scorePolicy: {},
      completionRule: {},
      answerKey: null,
      spec: {},
      runtime: {
        html: typeof rawContent === "string" ? rawContent.trim() || null : null,
        sandboxVersion: null,
        assets: [],
      },
      sourceBinding: null,
      provenance: null,
    };
  }

  const schemaId =
    typeof parsed.schema_id === "string" && parsed.schema_id.trim()
      ? parsed.schema_id.trim()
      : null;
  if (schemaId !== "interactive_game.v2") {
    return parseLegacyGamePayload(parsed);
  }

  const runtime = isRecord(parsed.runtime) ? parsed.runtime : {};
  return {
    schemaId,
    subtype: normalizeSubtype(parsed.subtype),
    title:
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim()
        : null,
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : null,
    subtitle:
      typeof parsed.subtitle === "string" && parsed.subtitle.trim()
        ? parsed.subtitle.trim()
        : null,
    teachingGoal:
      typeof parsed.teaching_goal === "string" && parsed.teaching_goal.trim()
        ? parsed.teaching_goal.trim()
        : null,
    teacherNotes: toStringList(parsed.teacher_notes),
    instructions: toStringList(parsed.instructions),
    scorePolicy: isRecord(parsed.score_policy) ? parsed.score_policy : {},
    completionRule: isRecord(parsed.completion_rule) ? parsed.completion_rule : {},
    answerKey: isRecord(parsed.answer_key) ? parsed.answer_key : null,
    spec: isRecord(parsed.spec) ? parsed.spec : {},
    runtime: {
      html:
        typeof runtime.html === "string" && runtime.html.trim()
          ? runtime.html.trim()
          : null,
      sandboxVersion:
        typeof runtime.sandbox_version === "string" && runtime.sandbox_version.trim()
          ? runtime.sandbox_version.trim()
          : null,
      assets: toStringList(runtime.assets),
    },
    sourceBinding: isRecord(parsed.source_binding) ? parsed.source_binding : null,
    provenance: isRecord(parsed.provenance) ? parsed.provenance : null,
  };
}

function getSubtypeLabel(subtype: InteractiveGameSubtype | null): string {
  switch (subtype) {
    case "drag_classification":
      return "拖拽归类";
    case "sequence_sort":
      return "流程排序";
    case "relationship_link":
      return "关系连线";
    default:
      return "互动游戏";
  }
}

function renderAnswerKey(answerKey: Record<string, unknown> | null): string {
  if (!answerKey) return "当前答案结构暂不可用。";
  return JSON.stringify(answerKey, null, 2);
}

function readNumericValue(
  source: Record<string, unknown>,
  key: string
): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

interface SandboxFeedbackState {
  message: string;
  tone: "neutral" | "good" | "bad";
  scoreText: string | null;
  progressText: string | null;
  timerText: string | null;
}

function buildSandboxSrcDoc(html: string): string {
  const sandboxPatch = `
<style>
html, body {
  height: 100%;
  overflow: auto !important;
  scrollbar-width: thin;
  background: #fff !important;
}
body::-webkit-scrollbar {
  width: 10px;
}
body::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.45);
  border-radius: 999px;
}
body::-webkit-scrollbar-track {
  background: transparent;
}
.app {
  min-height: 100vh !important;
  padding: 0 !important;
}
.shell {
  max-width: none !important;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
}
.hero {
  display: none !important;
}
.hero-copy {
  max-width: none !important;
  min-width: 0 !important;
  display: none !important;
}
.title {
  font-size: 18px !important;
  line-height: 1.3 !important;
}
.subtitle {
  margin-top: 4px !important;
  font-size: 12px !important;
  line-height: 1.45 !important;
}
.meta {
  display: none !important;
}
.instructions,
.feedback {
  display: none !important;
}
.content {
  padding: 0 !important;
  min-height: auto !important;
  display: block !important;
}
.workspace {
  margin-top: 0 !important;
  gap: 12px !important;
  overflow: visible !important;
  padding: 0 0 12px 0 !important;
}
.toolbar {
  display: none !important;
}
.card {
  border-radius: 0 !important;
  border-left: 0 !important;
  border-right: 0 !important;
  padding-left: 16px !important;
  padding-right: 16px !important;
}
.zones,
.link-grid {
  padding-bottom: 8px !important;
}
</style>
<script>
(function() {
  function applyLayout() {
    var meta = document.querySelector('.meta');
    if (meta) meta.style.display = 'none';
  }

  function bindExternalActions() {
    window.addEventListener('message', function(event) {
      var data = event && event.data ? event.data : null;
      if (!data || data.source !== 'spectra-interactive-game-host') return;
      if (data.type === 'CHECK_ANSWER') {
        var check = document.getElementById('check-btn');
        if (check) check.click();
      }
      if (data.type === 'RESET_GAME') {
        var reset = document.getElementById('reset-btn');
        if (reset) reset.click();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      applyLayout();
      bindExternalActions();
    }, { once: true });
  } else {
    applyLayout();
    bindExternalActions();
  }
  window.addEventListener('load', applyLayout, { once: true });
})();
</script>`;

  if (html.includes("</head>")) {
    return html.replace("</head>", `${sandboxPatch}</head>`);
  }
  if (html.includes("<body")) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${sandboxPatch}`);
  }
  return `${sandboxPatch}${html}`;
}

interface GameSurfaceAdapterProps {
  payload: InteractiveGamePayload;
  latestArtifactId?: string | null;
  onExportArtifact?: ((artifactId: string) => Promise<void> | void) | undefined;
}

export function GameSurfaceAdapter({
  payload,
  latestArtifactId,
  onExportArtifact,
}: GameSurfaceAdapterProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);
  const [isAnswerDialogOpen, setIsAnswerDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState<SandboxFeedbackState>({
    message: "开始作答。",
    tone: "neutral",
    scoreText: null,
    progressText: null,
    timerText: null,
  });

  const teacherNotes = useMemo(
    () => (payload.teacherNotes.length > 0 ? payload.teacherNotes : ["暂无额外教师备注。"]),
    [payload.teacherNotes]
  );
  const instructions = useMemo(
    () => (payload.instructions.length > 0 ? payload.instructions : ["进入游戏后按页面提示完成操作。"]),
    [payload.instructions]
  );
  const maxScore = readNumericValue(payload.scorePolicy, "max_score");
  const timerSeconds = readNumericValue(payload.scorePolicy, "timer_seconds");
  const passThreshold = readNumericValue(payload.completionRule, "pass_threshold");

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!isRecord(data) || data.source !== "spectra-interactive-game-runtime") {
        return;
      }

      if (data.type === "GAME_STATE") {
        setFeedback((current) => ({
          ...current,
          scoreText:
            typeof data.score === "number" && Number.isFinite(data.score)
              ? String(data.score)
              : current.scoreText,
          progressText:
            typeof data.progressText === "string" ? data.progressText : current.progressText,
          timerText:
            typeof data.timerText === "string" ? data.timerText : current.timerText,
        }));
        return;
      }

      if (data.type === "GAME_FEEDBACK") {
        setFeedback((current) => ({
          message:
            typeof data.message === "string" && data.message.trim().length > 0
              ? data.message.trim()
              : current.message,
          tone:
            data.tone === "good" || data.tone === "bad" || data.tone === "neutral"
              ? data.tone
              : current.tone,
          scoreText:
            typeof data.score === "number" && Number.isFinite(data.score)
              ? String(data.score)
              : current.scoreText,
          progressText:
            typeof data.progressText === "string" ? data.progressText : current.progressText,
          timerText:
            typeof data.timerText === "string" ? data.timerText : current.timerText,
        }));
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const postSandboxAction = (type: "CHECK_ANSWER" | "RESET_GAME") => {
    if (type === "RESET_GAME") {
      setFeedback({
        message: "正在重新开始。",
        tone: "neutral",
        scoreText: null,
        progressText: null,
        timerText: null,
      });
    }
    iframeRef.current?.contentWindow?.postMessage(
      { source: "spectra-interactive-game-host", type },
      "*"
    );
  };

  if (!payload.runtime.html) {
    return (
      <WorkbenchCenteredState
        tone="rose"
        icon={HelpCircle}
        title="暂未收到可试玩 sandbox"
        description="后端返回新的 interactive_game.v2 结果后，这里会直接变成可试玩小游戏。"
        minHeightClassName="min-h-[520px]"
      />
    );
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[20px] border border-zinc-200 bg-white">
        <div className="flex items-center justify-end gap-2 border-b border-zinc-200 px-3 py-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full bg-white"
            onClick={() => setIsRuleDialogOpen(true)}
            aria-label="查看规则"
            title="查看规则"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full bg-white"
            onClick={() => setIsAnswerDialogOpen(true)}
            aria-label="查看答案"
            title="查看答案"
          >
            <KeyRound className="h-4 w-4" />
          </Button>
          {latestArtifactId && onExportArtifact ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full bg-white"
              onClick={() => void onExportArtifact(latestArtifactId)}
              aria-label="导出"
              title="导出"
            >
              <Download className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <iframe
            ref={iframeRef}
            title="interactive-game-sandbox"
            srcDoc={buildSandboxSrcDoc(payload.runtime.html)}
            sandbox="allow-scripts"
            className="h-full min-h-[680px] w-full bg-white"
          />
        </div>
        <div className="border-t border-zinc-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={[
                "min-w-0 flex-1 text-sm leading-6",
                feedback.tone === "good"
                  ? "text-emerald-600"
                  : feedback.tone === "bad"
                    ? "text-rose-600"
                    : "text-zinc-600",
              ].join(" ")}
            >
              {feedback.message}
            </div>
            {feedback.progressText ? (
              <div className="shrink-0 text-xs text-zinc-500">
                进度 {feedback.progressText}
              </div>
            ) : null}
            {feedback.scoreText ? (
              <div className="shrink-0 text-xs text-zinc-500">
                得分 {feedback.scoreText}
              </div>
            ) : null}
            {feedback.timerText ? (
              <div className="shrink-0 text-xs text-zinc-500">
                计时 {feedback.timerText}
              </div>
            ) : null}
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-full px-3 text-xs"
            onClick={() => postSandboxAction("CHECK_ANSWER")}
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            检查答案
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-full px-3 text-xs"
            onClick={() => postSandboxAction("RESET_GAME")}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            重新开始
          </Button>
        </div>
        </div>
      </div>

      <Dialog open={isRuleDialogOpen} onOpenChange={setIsRuleDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>规则说明</DialogTitle>
            <DialogDescription>
              {payload.title ?? getSubtypeLabel(payload.subtype)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-zinc-700">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                教学目标
              </p>
              <p className="mt-2 leading-6">
                {payload.teachingGoal ?? "当前结果未写入教学目标。"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                玩法设置
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700">
                  {getSubtypeLabel(payload.subtype)}
                </span>
                {maxScore !== null ? (
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700">
                    满分 {maxScore}
                  </span>
                ) : null}
                {timerSeconds !== null ? (
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700">
                    计时 {Math.floor(timerSeconds / 60)}:
                    {String(timerSeconds % 60).padStart(2, "0")}
                  </span>
                ) : null}
                {passThreshold !== null ? (
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700">
                    通过阈值 {passThreshold}
                  </span>
                ) : null}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                学生操作
              </p>
              <div className="mt-2 space-y-2">
                {instructions.map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                教师备注
              </p>
              <div className="mt-2 space-y-2">
                {teacherNotes.map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAnswerDialogOpen} onOpenChange={setIsAnswerDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>标准结构</DialogTitle>
            <DialogDescription>
              当前 artifact 返回的答案结构与可核对数据。
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[420px] overflow-auto rounded-xl border border-zinc-200 bg-zinc-950 p-4 text-xs leading-5 text-zinc-100">
            {renderAnswerKey(payload.answerKey)}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}
