import {
  getGradeBandLabel,
  getTeachingModelLabel,
  getVariantLabel,
} from "./constants";
import type {
  WordDifficultyLayer,
  WordDocumentVariant,
  WordGradeBand,
  WordTeachingModel,
} from "./types";

interface BuildWordMarkdownArgs {
  topic: string;
  goal: string;
  documentVariant: WordDocumentVariant;
  teachingModel: WordTeachingModel;
  gradeBand: WordGradeBand;
  difficultyLayer: WordDifficultyLayer;
}

export function buildWordMarkdown({
  topic,
  goal,
  documentVariant,
  teachingModel,
  gradeBand,
  difficultyLayer,
}: BuildWordMarkdownArgs): string {
  const title = getVariantLabel(documentVariant);
  const teachingModelLabel = getTeachingModelLabel(teachingModel);
  const gradeBandLabel = getGradeBandLabel(gradeBand);

  if (documentVariant === "layered_lesson_plan") {
    return [
      `# ${topic} · ${title}`,
      "",
      "## 基本信息",
      `- 适用年级：${gradeBandLabel}`,
      `- 教学模式：${teachingModelLabel}`,
      `- 当前分层：${difficultyLayer} 层`,
      `- 教学目标：${goal}`,
      "",
      "## 课堂流程建议",
      "1. 导入：用一个生活场景引出核心概念",
      "2. 讲解：梳理定义、方法和典型易错点",
      `3. 分层任务：以 ${difficultyLayer} 层目标为主完成课堂练习`,
      "4. 反馈：学生讲解 + 教师点评 + 课后延伸",
      "",
      "## 分层任务设计",
      "- A 层：重点做基础判断与概念巩固",
      "- B 层：强调综合应用与步骤表达",
      "- C 层：加入开放探究题与迁移应用",
    ].join("\n");
  }

  if (documentVariant === "student_handout") {
    return [
      `# ${topic} · ${title}`,
      "",
      "## 学习目标",
      `- 适用年级：${gradeBandLabel}`,
      `- 本节目标：${goal}`,
      "",
      "## 课堂讲义结构",
      "1. 概念速览：本节关键词",
      "2. 例题拆解：一步一步看解法",
      "3. 自主练习：课堂即时巩固",
      "4. 课后反思：我还不懂什么？",
    ].join("\n");
  }

  if (documentVariant === "post_class_quiz") {
    return [
      `# ${topic} · ${title}`,
      "",
      "## 测验说明",
      `- 适用年级：${gradeBandLabel}`,
      `- 目标聚焦：${goal}`,
      "",
      "## 题目结构建议",
      "- 基础题：4 题（概念判断）",
      "- 应用题：3 题（情境迁移）",
      "- 提升题：1 题（开放表达）",
      "",
      "## 评分建议",
      "1. 过程完整度",
      "2. 思路清晰度",
      "3. 易错点修正能力",
    ].join("\n");
  }

  return [
    `# ${topic} · ${title}`,
    "",
    "## 实验目标",
    `- 适用年级：${gradeBandLabel}`,
    `- 本次目标：${goal}`,
    "",
    "## 实验准备",
    "- 材料与设备清单",
    "- 安全注意事项",
    "",
    "## 实验步骤",
    "1. 分组与环境检查",
    "2. 按步骤执行并记录数据",
    "3. 结果分析与误差讨论",
  ].join("\n");
}

