import type { AnimationRhythm } from "./types";

export type AnimationSpecPreview = {
  visualType: "process_flow" | "relationship_change" | "structure_breakdown";
  visualLabel: string;
  teachingGoal: string;
  objects: string[];
  objectDetails: Array<{
    label: string;
    role: string;
  }>;
  scenes: Array<{
    title: string;
    description: string;
  }>;
};

const NETWORK_LAYER_ORDER = [
  "应用层",
  "传输层",
  "网络层",
  "数据链路层",
  "物理层",
];
const NETWORK_LAYER_DETAILS: Record<string, string> = {
  应用层: "直接面向用户应用，负责提供 HTTP、DNS 等网络服务。",
  传输层: "负责端到端传输，保证数据分段、复用与可靠性控制。",
  网络层: "负责逻辑寻址与路由，让数据找到目标网络。",
  数据链路层: "负责相邻节点间成帧、差错检测与介质访问控制。",
  物理层: "负责把比特转换成信号，在介质上传输。",
};

function getRhythmHint(rhythm: AnimationRhythm): string {
  if (rhythm === "slow") return "节奏放慢，留出更多讲解停顿。";
  if (rhythm === "fast") return "节奏加快，优先保留关键结论与切换。";
  return "节奏均衡，兼顾完整性与观看效率。";
}

function cleanText(value: string): string {
  return value.trim();
}

function inferVisualType(text: string): AnimationSpecPreview["visualType"] {
  if (/分层|层次结构|网络层|结构|组成|部件|层级|拆解|剖面/.test(text)) {
    return "structure_breakdown";
  }
  if (/关系|变化|趋势|增减|影响|变量/.test(text)) {
    return "relationship_change";
  }
  return "process_flow";
}

function extractObjects(topic: string, focus: string): string[] {
  const combined = `${topic} ${focus}`;
  if (/计算机网络/.test(combined) && /分层|层次|网络层|结构/.test(combined)) {
    return NETWORK_LAYER_ORDER;
  }
  return [];
}

function getVisualLabel(
  visualType: AnimationSpecPreview["visualType"]
): string {
  if (visualType === "structure_breakdown") return "结构拆解模板";
  if (visualType === "relationship_change") return "关系变化模板";
  return "过程演示模板";
}

function buildObjectDetails(objects: string[]) {
  return objects.map((label) => ({
    label,
    role: NETWORK_LAYER_DETAILS[label] || `${label} 是该结构中的关键组成部分。`,
  }));
}

export function buildAnimationSpecPreview(params: {
  topic: string;
  focus: string;
  rhythm: AnimationRhythm;
}): AnimationSpecPreview {
  const topic = cleanText(params.topic) || "教学动画";
  const focus = cleanText(params.focus);
  const rhythmHint = getRhythmHint(params.rhythm);
  const combined = `${topic} ${focus}`;
  const visualType = inferVisualType(combined);
  const objects =
    visualType === "structure_breakdown" ? extractObjects(topic, focus) : [];

  if (visualType === "structure_breakdown" && objects.length > 0) {
    return {
      visualType,
      visualLabel: getVisualLabel(visualType),
      teachingGoal: focus || `帮助学生看清 ${topic} 的整体层次与层间关系。`,
      objects,
      objectDetails: buildObjectDetails(objects),
      scenes: [
        {
          title: "先看整体结构",
          description: `先建立整体框架：${objects.join(" -> ")}。`,
        },
        {
          title: "逐层展开关键部分",
          description: `当前层高亮，其他层弱化，突出职责差异。${rhythmHint}`,
        },
        {
          title: "回到层间协作",
          description: `总结这些层如何共同完成 ${topic} 的整体工作。`,
        },
      ],
    };
  }

  if (visualType === "relationship_change") {
    return {
      visualType,
      visualLabel: getVisualLabel(visualType),
      teachingGoal: focus || `帮助学生理解 ${topic} 的关键变化关系。`,
      objects: [],
      objectDetails: [],
      scenes: [
        {
          title: "先看变化对象",
          description: `先明确 ${topic} 中哪些量在变化。`,
        },
        {
          title: "突出关键拐点",
          description: `强调转折、增减和因果关联。${rhythmHint}`,
        },
        { title: "给出教学结论", description: "把变化规律落回课堂结论。" },
      ],
    };
  }

  return {
    visualType,
    visualLabel: getVisualLabel(visualType),
    teachingGoal: focus || `帮助学生按步骤理解 ${topic}。`,
    objects: [],
    objectDetails: [],
    scenes: [
      { title: "引入主题", description: `先说明这段动画为什么要讲 ${topic}。` },
      {
        title: "展开关键过程",
        description: `按步骤突出阶段切换和关键因果。${rhythmHint}`,
      },
      { title: "收束到结论", description: "总结课堂需要带走的核心结论。" },
    ],
  };
}
