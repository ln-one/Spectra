import type { WorkflowStepItem } from "@/components/project/shared";
import type { StudentProfile, VirtualStudent } from "./types";

export const SIMULATION_STEPS: WorkflowStepItem[] = [
  {
    id: "config",
    title: "配置",
    description: "先设定本轮预演主题和提问强度。",
    caption: "准备沙盘",
  },
  {
    id: "generate",
    title: "生成",
    description: "确认参数，生成虚拟学生提问场景。",
    caption: "开始预演",
  },
  {
    id: "preview",
    title: "预览",
    description: "在面板里进行群聊式问答和策略训练。",
    caption: "实战演练",
  },
];

export const STUDENT_PROFILES: Array<{
  value: StudentProfile;
  label: string;
  description: string;
}> = [
  {
    value: "divergent_top",
    label: "发散型优等生",
    description: "问题跨度大，喜欢追问边界条件。",
  },
  {
    value: "detail_oriented",
    label: "细节型理科生",
    description: "关注推导过程和每一步依据。",
  },
  {
    value: "confused_beginner",
    label: "易混型基础生",
    description: "常把概念混在一起，需要纠偏。",
  },
];

export const DEFAULT_STUDENTS: VirtualStudent[] = [
  { id: "stu-1", name: "小林", tag: "发散思维", profile: "divergent_top" },
  { id: "stu-2", name: "小周", tag: "细节导向", profile: "detail_oriented" },
  { id: "stu-3", name: "小许", tag: "概念易混", profile: "confused_beginner" },
];

export const STRATEGY_POOL = [
  "先共情再纠偏：先肯定问题敏锐度，再拆分概念边界。",
  "从反例切入：给出一个极端情形让学生自行检验逻辑。",
  "双层回答：先给直觉解释，再给规范术语版本。",
  "先给一句结论，再补充三步推导，让学生跟得上。",
];

export function getReadinessLabel(status?: string | null): string {
  if (status === "ready") return "可直接生成";
  if (status === "foundation_ready") return "基础能力可用";
  if (status === "protocol_pending") return "能力准备中";
  return "状态加载中";
}
