import type { SlideScriptItem, SpeechTone } from "./types";

interface BuildScriptParams {
  topic: string;
  tone: SpeechTone;
  emphasizeInteraction: boolean;
}

function tonePrefix(tone: SpeechTone): string {
  if (tone === "energetic") return "同学们我们马上进入今天最关键的部分。";
  if (tone === "professional") return "接下来我将用结构化方式说明本页核心内容。";
  return "我们慢慢来看这页最重要的知识点。";
}

export function buildSlideScripts({
  topic,
  tone,
  emphasizeInteraction,
}: BuildScriptParams): SlideScriptItem[] {
  const resolvedTopic = topic.trim() || "本节课主题";
  const interactionLine = emphasizeInteraction
    ? "这里停一下，邀请两位同学先说说他们的判断。"
    : "这里用一句总结帮助学生先建立整体框架。";

  return [
    {
      page: 1,
      title: "开场引入",
      script: `${tonePrefix(tone)}今天我们围绕“${resolvedTopic}”展开。先用一个生活化问题把大家带入情境。`,
      actionHint: "动作提示：开场停顿 2 秒，扫视全班。",
    },
    {
      page: 2,
      title: "核心概念",
      script: `这一页重点讲定义和判断标准。${interactionLine}`,
      actionHint: "动作提示：提问后等待 3 秒，再揭示标准答案。",
    },
    {
      page: 3,
      title: "案例讲解",
      script:
        "我们用一个典型案例走完整个思考路径，强调“为什么这么做”而不是只记结论。",
      actionHint: "动作提示：讲关键步骤时放慢语速。",
    },
    {
      page: 4,
      title: "总结收束",
      script:
        "最后用一句口诀回收本节主线，再交代课后练习的使用方法和注意点。",
      actionHint: "动作提示：总结时提高音量，给出明确行动指令。",
    },
  ];
}
