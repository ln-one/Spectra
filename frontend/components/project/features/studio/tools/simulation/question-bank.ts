import type {
  SimulationQuestion,
  StudentProfile,
  VirtualStudent,
} from "./types";

interface BuildQuestionsParams {
  topic: string;
  intensity: number;
  profile: StudentProfile;
  students: VirtualStudent[];
}

function scopeText(topic: string): string {
  return topic.trim() || "本节核心知识点";
}

function pickDepth(
  intensity: number,
  index: number
): "basic" | "medium" | "hard" {
  if (intensity >= 80) return index % 2 === 0 ? "hard" : "medium";
  if (intensity >= 50) return index % 3 === 0 ? "hard" : "medium";
  return index % 2 === 0 ? "basic" : "medium";
}

function profileQuestion(
  profile: StudentProfile,
  topic: string,
  depth: string
): string {
  if (profile === "divergent_top") {
    return `如果“${topic}”的前提被打破，结论还成立吗？请给一个${depth}层次的例子。`;
  }
  if (profile === "detail_oriented") {
    return `在“${topic}”里，这一步推导为什么可以这么写？能不能再拆细一点？`;
  }
  return `我总是把“${topic}”和相近概念混淆，老师能用一句话帮我区分吗？`;
}

export function buildSimulationQuestions({
  topic,
  intensity,
  profile,
  students,
}: BuildQuestionsParams): SimulationQuestion[] {
  const resolvedTopic = scopeText(topic);
  return students.map((student, index) => {
    const depth = pickDepth(intensity, index);
    return {
      id: `${student.id}-q${index + 1}`,
      studentId: student.id,
      text: profileQuestion(profile, resolvedTopic, depth),
      depth,
    };
  });
}

export function buildJudgeComment(answer: string, intensity: number): string {
  if (!answer.trim()) return "";
  if (intensity >= 80) {
    return "裁判评价：回答方向正确，建议补一个反例并解释边界条件。";
  }
  if (intensity >= 50) {
    return "裁判评价：结构清晰，可再加一句“为什么这样做”增强说服力。";
  }
  return "裁判评价：表达清楚，适合课堂即时反馈。";
}
