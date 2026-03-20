import {
  BookOpen,
  Clock,
  FileText,
  Layers,
  Palette,
  Star,
  Users,
  Wand2,
} from "lucide-react";

export const features = [
  {
    icon: Wand2,
    title: "AI 智能生成",
    description: "基于先进的 Qwen 大模型，理解教学内容自动生成结构化课件",
    color: "from-violet-500 to-purple-500",
  },
  {
    icon: FileText,
    title: "多格式支持",
    description: "一键导出 PPT、Word 等多种格式，满足不同教学场景需求",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Layers,
    title: "模块化编辑",
    description: "灵活的章节编辑功能，支持自由调整内容结构和样式",
    color: "from-emerald-500 to-green-500",
  },
  {
    icon: Palette,
    title: "精美模板",
    description: "内置多种专业设计的教学模板，让课件更加美观专业",
    color: "from-orange-500 to-amber-500",
  },
];

export const steps = [
  {
    number: "01",
    title: "创建项目",
    description: "输入课程主题和基本信息",
    icon: BookOpen,
  },
  {
    number: "02",
    title: "AI 生成",
    description: "AI 分析需求生成大纲",
    icon: Wand2,
  },
  {
    number: "03",
    title: "编辑优化",
    description: "可视化编辑器调整内容",
    icon: Layers,
  },
  {
    number: "04",
    title: "导出使用",
    description: "导出为 PPT 或 Word 格式",
    icon: FileText,
  },
];

export const stats = [
  { value: "10K+", label: "活跃用户", icon: Users },
  { value: "50K+", label: "生成课件", icon: FileText },
  { value: "99%", label: "满意度", icon: Star },
  { value: "24/7", label: "AI 支持", icon: Clock },
];

export const testimonials = [
  {
    name: "张老师",
    role: "高中数学教师",
    avatar: "/avatars/teacher1.jpg",
    initials: "张",
    content:
      "Spectra 让我的备课时间减少了一半，AI 生成的课件结构清晰，内容专业。",
    rating: 5,
  },
  {
    name: "李老师",
    role: "初中语文教师",
    avatar: "/avatars/teacher2.jpg",
    initials: "李",
    content: "模板设计非常精美，学生都说现在的课件更好看了。强烈推荐！",
    rating: 5,
  },
  {
    name: "王老师",
    role: "小学科学教师",
    avatar: "/avatars/teacher3.jpg",
    initials: "王",
    content: "操作简单直观，即使不太懂技术的老师也能快速上手。",
    rating: 5,
  },
];
