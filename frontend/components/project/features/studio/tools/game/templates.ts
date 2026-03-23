import type { GameMode } from "./types";

interface GameDraftData {
  topic: string;
  mode: GameMode;
  countdown: number;
  life: number;
  ideaTags: string[];
}

function escapeJsString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

function topicOrDefault(topic: string): string {
  return topic.trim() || "本节知识点";
}

export function getModeLabel(mode: GameMode): string {
  if (mode === "timeline_sort") return "时间轴排序";
  if (mode === "concept_match") return "概念连线";
  return "自由探索";
}

export function buildSandboxTitle(data: GameDraftData): string {
  const modeLabel = getModeLabel(data.mode);
  return `${topicOrDefault(data.topic)} · ${modeLabel}`;
}

export function buildSandboxDescription(data: GameDraftData): string {
  if (data.mode === "timeline_sort") {
    return "拖拽事件卡片到正确时间轴，系统会即时给出反馈。";
  }
  if (data.mode === "concept_match") {
    return "将概念与解释进行连线配对，连错会收到提示。";
  }
  return "根据线索推进关卡，在倒计时内完成目标任务。";
}

export function buildPseudoCode(data: GameDraftData): string {
  const ruleTags =
    data.ideaTags.length > 0 ? data.ideaTags.join(" / ") : "无额外规则";

  return [
    "const gameConfig = {",
    `  topic: "${escapeJsString(topicOrDefault(data.topic))}",`,
    `  mode: "${data.mode}",`,
    `  countdown: ${data.countdown},`,
    `  life: ${data.life},`,
    `  extraRules: "${escapeJsString(ruleTags)}",`,
    "};",
    "",
    "function onUserAction(action) {",
    "  // TODO: AI-generated interaction logic",
    "  // 1) score 2) feedback 3) win/lose check",
    "}",
  ].join("\n");
}
