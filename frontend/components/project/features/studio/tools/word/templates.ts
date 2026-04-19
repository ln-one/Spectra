import {
  getDetailLevelLabel,
  getGradeBandLabel,
} from "./constants";
import type {
  LessonPlanDetailLevel,
  LessonPlanGradeBand,
} from "./types";

interface BuildLessonPlanMarkdownArgs {
  topic: string;
  goal: string;
  detailLevel: LessonPlanDetailLevel;
  gradeBand: LessonPlanGradeBand;
  teachingContext?: string;
  studentNeeds?: string;
  outputRequirements?: string;
}

export function buildLessonPlanMarkdown({
  topic,
  goal,
  detailLevel,
  gradeBand,
  teachingContext = "",
  studentNeeds = "",
  outputRequirements = "",
}: BuildLessonPlanMarkdownArgs): string {
  return [
    `# ${topic} 教案`,
    "",
    "## 基本信息",
    `- 适用学段：${getGradeBandLabel(gradeBand)}`,
    `- 详细程度：${getDetailLevelLabel(detailLevel)}`,
    `- 学习目标：${goal}`,
    teachingContext ? `- 教学场景：${teachingContext}` : null,
    studentNeeds ? `- 学生画像：${studentNeeds}` : null,
    outputRequirements ? `- 输出要求：${outputRequirements}` : null,
    "",
    "## 学习目标",
    "- 明确本节课要学会什么、理解什么、做到什么。",
    "",
    "## 评价任务",
    "- 设计一项能够判断学生是否达成目标的课堂任务。",
    "",
    "## 学习过程",
    "1. 导入：用贴近生活的问题引入课题。",
    "2. 展开：围绕核心概念和例子推进课堂讲解。",
    "3. 活动：安排讨论、练习或探究任务。",
    "4. 检测：通过提问、练习或展示确认学习结果。",
    "",
    "## 练习与检测",
    "- 准备一组基础巩固与课堂检测任务。",
    "",
    "## 反思",
    "- 记录本节课可以继续优化的地方。",
  ]
    .filter(Boolean)
    .join("\n");
}
