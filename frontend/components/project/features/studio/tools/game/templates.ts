import type { GameMode } from "./types";

interface GameDraftData {
  topic: string;
  mode: GameMode;
  countdown: number;
  life: number;
  ideaTags: string[];
}

function topicOrDefault(topic: string): string {
  return topic.trim() || "本节知识点";
}

export function getModeLabel(mode: GameMode): string {
  if (mode === "timeline_sort") return "时间轴排序";
  if (mode === "concept_match") return "概念连线";
  return "推理解谜";
}

export function buildSandboxTitle(data: GameDraftData): string {
  const modeLabel = getModeLabel(data.mode);
  return `${topicOrDefault(data.topic)} · ${modeLabel}`;
}

export function buildSandboxDescription(data: GameDraftData): string {
  if (data.mode === "timeline_sort") {
    return "拖拽事件卡片到正确时间顺序，系统会实时判定是否正确。";
  }
  if (data.mode === "concept_match") {
    return "把左侧概念和右侧解释进行连线，连错会给出提示。";
  }
  return "根据线索选择下一步行动，目标是在倒计时内完成闯关。";
}

export function buildPseudoCode(data: GameDraftData): string {
  const ruleTags =
    data.ideaTags.length > 0 ? data.ideaTags.join(" / ") : "无额外规则";
  return [
    "const gameConfig = {",
    `  topic: "${topicOrDefault(data.topic)}",`,
    `  mode: "${data.mode}",`,
    `  countdown: ${data.countdown},`,
    `  life: ${data.life},`,
    `  extraRules: "${ruleTags}",`,
    "};",
    "",
    "function onUserAction(action) {",
    "  // TODO: AI-generated interaction logic",
    "  // 1) 评分 2) 反馈 3) 过关判定",
    "}",
  ].join("\n");
}
