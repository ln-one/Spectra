"use client";

import { useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Presentation,
  FileText,
  HelpCircle,
  Brain,
  Sparkles,
  RefreshCw,
  Wand2,
  BookOpen,
  Users,
  Globe,
  Zap,
  ChevronRight,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OutlineEditorPanel } from "./OutlineEditorPanel";

const CONTENT_TYPES = [
  {
    id: "presentation",
    name: "教学课件",
    icon: Presentation,
    emoji: "🎨",
    gradient: "from-orange-500 to-amber-500",
    bgLight: "bg-orange-50",
    description: "精美PPT演示文稿",
  },
  {
    id: "document",
    name: "结构教案",
    icon: FileText,
    emoji: "📄",
    gradient: "from-blue-500 to-cyan-500",
    bgLight: "bg-blue-50",
    description: "完整教学方案",
  },
  {
    id: "quiz",
    name: "互动测验",
    icon: HelpCircle,
    emoji: "📱",
    gradient: "from-purple-500 to-pink-500",
    bgLight: "bg-purple-50",
    description: "趣味测试题目",
  },
  {
    id: "mindmap",
    name: "知识图谱",
    icon: Brain,
    emoji: "🗺️",
    gradient: "from-emerald-500 to-teal-500",
    bgLight: "bg-emerald-50",
    description: "知识结构可视化",
  },
];

const PAGE_COUNTS = [
  { value: "10", label: "10 页", desc: "快速概览" },
  { value: "15", label: "15 页", desc: "标准课时" },
  { value: "20", label: "20 页", desc: "详细展开" },
  { value: "25", label: "25 页", desc: "深度讲解" },
];

const AUDIENCES = [
  { value: "k12", label: "K12 基础教育", icon: "🎒" },
  { value: "higher", label: "高等教育", icon: "🎓" },
  { value: "enterprise", label: "企业培训", icon: "💼" },
  { value: "general", label: "通用教育", icon: "📚" },
];

const LANGUAGES = [
  { value: "zh-CN", label: "简体中文", flag: "🇨🇳" },
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "ja", label: "日本語", flag: "🇯🇵" },
];

const INSPIRATION_PROMPTS = [
  "生成一份关于《光合作用》的初中生物课件，要求包含3个互动提问环节",
  "制作高中物理《牛顿运动定律》教学课件，需要动画演示和例题解析",
  "创建《古诗词鉴赏》课件，包含意境配图和朗读音频建议",
  "设计《数据结构与算法》大学课程教案，含代码示例和复杂度分析",
  "生成《中国近代史》互动测验，包含选择题和材料分析题",
  "制作《英语口语》课件，包含情景对话和发音要点",
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 350,
      damping: 28,
    },
  },
};

interface GenerationConfigPanelProps {
  variant?: "default" | "compact";
  onBack?: () => void;
  onGenerate?: (config: GenerationConfig) => void;
}

export interface GenerationConfig {
  contentType: string;
  pageCount: string;
  audience: string;
  language: string;
  prompt: string;
}

export function GenerationConfigPanel({
  variant = "default",
  onBack,
  onGenerate,
}: GenerationConfigPanelProps) {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [selectedType, setSelectedType] = useState<string>("presentation");
  const [pageCount, setPageCount] = useState<string>("15");
  const [audience, setAudience] = useState<string>("k12");
  const [language, setLanguage] = useState<string>("zh-CN");
  const [prompt, setPrompt] = useState<string>("");
  const [prompts, setPrompts] = useState<string[]>(INSPIRATION_PROMPTS.slice(0, 6));
  const [showOutlineEditor, setShowOutlineEditor] = useState(false);
  const [generatedConfig, setGeneratedConfig] = useState<GenerationConfig | null>(null);
  const [sessionId, setSessionId] = useState<string>("");

  const shufflePrompts = useCallback(() => {
    const shuffled = [...INSPIRATION_PROMPTS].sort(() => Math.random() - 0.5);
    setPrompts(shuffled.slice(0, 6));
  }, []);

  const handleGenerate = useCallback(() => {
    const config: GenerationConfig = {
      contentType: selectedType,
      pageCount,
      audience,
      language,
      prompt,
    };
    setGeneratedConfig(config);
    setShowOutlineEditor(true);
    onGenerate?.(config);
  }, [selectedType, pageCount, audience, language, prompt, onGenerate]);

  const handleBackFromOutline = useCallback(() => {
    setShowOutlineEditor(false);
  }, []);

  const handleConfirmOutline = useCallback(() => { }, []);

  const handleGoToPreview = useCallback(() => {
    if (projectId) {
      const newSessionId = `session-${Date.now()}`;
      router.push(`/projects/${projectId}/generate?session=${newSessionId}`);
    }
  }, [projectId, router]);

  const selectedTypeConfig = CONTENT_TYPES.find((t) => t.id === selectedType);

  if (variant === "compact") {
    return (
      <AnimatePresence mode="wait">
        {showOutlineEditor ? (
          <motion.div
            key="outline-editor"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="h-full"
          >
            <OutlineEditorPanel
              variant="compact"
              topic={generatedConfig?.prompt || "课件大纲"}
              onBack={handleBackFromOutline}
              onConfirm={handleConfirmOutline}
              onPreview={handleGoToPreview}
            />
          </motion.div>
        ) : (
          <motion.div
            key="config-panel"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col gap-3 h-full"
          >
            <motion.div variants={itemVariants}>
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <Wand2 className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-xs font-medium text-zinc-500">选择内容类型</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {CONTENT_TYPES.map((type) => {
                  const isSelected = selectedType === type.id;
                  return (
                    <motion.button
                      key={type.id}
                      whileHover={{ scale: 1.03, y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setSelectedType(type.id)}
                      className={cn(
                        "relative p-3 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-200",
                        "border backdrop-blur-sm",
                        isSelected
                          ? `bg-gradient-to-br ${type.bgLight} border-transparent shadow-md`
                          : "bg-white/70 border-zinc-200/60 hover:bg-white hover:border-zinc-300"
                      )}
                    >
                      <motion.span
                        className="text-xl"
                        animate={{ scale: isSelected ? 1.1 : 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      >
                        {type.emoji}
                      </motion.span>
                      <span
                        className={cn(
                          "text-xs font-medium transition-colors",
                          isSelected ? "text-zinc-800" : "text-zinc-600"
                        )}
                      >
                        {type.name}
                      </span>
                      {isSelected && (
                        <motion.div
                          layoutId="compact-type-indicator"
                          className={cn(
                            "absolute inset-0 rounded-xl opacity-20",
                            `bg-gradient-to-br ${type.gradient}`
                          )}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>

            <motion.div variants={itemVariants} className="flex gap-2 justify-center">
              <Select value={pageCount} onValueChange={setPageCount}>
                <SelectTrigger className="w-[80px] h-8 bg-white/80 border-zinc-200/60 text-zinc-700 text-xs hover:bg-white hover:border-zinc-300 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-zinc-200 text-zinc-700 shadow-lg">
                  {PAGE_COUNTS.map((item) => (
                    <SelectItem
                      key={item.value}
                      value={item.value}
                      className="text-xs focus:bg-zinc-100"
                    >
                      <span>{item.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger className="w-[100px] h-8 bg-white/80 border-zinc-200/60 text-zinc-700 text-xs hover:bg-white hover:border-zinc-300 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-zinc-200 text-zinc-700 shadow-lg">
                  {AUDIENCES.map((item) => (
                    <SelectItem
                      key={item.value}
                      value={item.value}
                      className="text-xs focus:bg-zinc-100"
                    >
                      <span className="mr-1">{item.icon}</span>
                      <span>{item.label.split(" ")[0]}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-[80px] h-8 bg-white/80 border-zinc-200/60 text-zinc-700 text-xs hover:bg-white hover:border-zinc-300 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-zinc-200 text-zinc-700 shadow-lg">
                  {LANGUAGES.map((item) => (
                    <SelectItem
                      key={item.value}
                      value={item.value}
                      className="text-xs focus:bg-zinc-100"
                    >
                      <span className="mr-1">{item.flag}</span>
                      <span>{item.label.split(" ")[0]}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </motion.div>

            <motion.div variants={itemVariants} className="flex-1 min-h-0">
              <div className="relative bg-gradient-to-br from-white/80 to-white/40 rounded-xl border border-zinc-200/60 focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-zinc-200/50 transition-all shadow-sm h-full">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="描述您的教学目标、核心知识点..."
                  className="w-full h-full min-h-[80px] p-3 pb-12 resize-none bg-transparent outline-none text-sm text-zinc-700 placeholder:text-zinc-400 leading-relaxed"
                />
                <motion.div
                  className="absolute bottom-2.5 right-2.5"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <Button
                    size="sm"
                    onClick={handleGenerate}
                    disabled={!prompt.trim()}
                    className={cn(
                      "h-8 px-4 text-xs font-medium border-0 shadow-md transition-all",
                      prompt.trim()
                        ? `bg-gradient-to-r ${selectedTypeConfig?.gradient || "from-orange-500 to-amber-500"} hover:shadow-lg hover:scale-105`
                        : "bg-zinc-200 text-zinc-400"
                    )}
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    生成
                  </Button>
                </motion.div>
              </div>
            </motion.div>

            <motion.div variants={itemVariants}>
              <div className="flex items-center justify-center gap-2 mb-2">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent" />
                <div className="flex items-center gap-1">
                  <Lightbulb className="w-3 h-3 text-amber-500" />
                  <span className="text-xs text-zinc-400 font-medium">示例提示</span>
                </div>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {prompts.slice(0, 4).map((text, index) => (
                  <motion.button
                    key={index}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setPrompt(text)}
                    className="p-2.5 rounded-lg bg-white/60 text-xs text-zinc-500 hover:text-zinc-700 hover:bg-white hover:shadow-sm cursor-pointer transition-all text-left line-clamp-2 border border-transparent hover:border-zinc-200"
                  >
                    {text}
                  </motion.button>
                ))}
              </div>

              <div className="flex justify-center mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={shufflePrompts}
                  className="text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 h-7 text-xs px-3"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  换一组
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <div className="h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full opacity-30"
          style={{
            background: "radial-gradient(circle, rgba(139,92,246,0.4) 0%, transparent 70%)",
          }}
          animate={{
            x: [0, 50, 0],
            y: [0, 30, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full opacity-20"
          style={{
            background: "radial-gradient(circle, rgba(59,130,246,0.4) 0%, transparent 70%)",
          }}
          animate={{
            x: [0, -30, 0],
            y: [0, -50, 0],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMSIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
      </div>

      <motion.nav
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="h-14 px-6 flex items-center justify-between w-full relative z-10 shrink-0 border-b border-white/5"
      >
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-zinc-400 hover:text-white hover:bg-white/5 h-8"
          >
            返回
          </Button>
          <Badge variant="secondary" className="bg-white/5 text-zinc-400 border-white/10 text-[10px]">
            Beta
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-zinc-400 hover:text-white hover:bg-white/5 h-8"
        >
          <HelpCircle className="w-4 h-4 mr-1.5" />
          帮助
        </Button>
      </motion.nav>

      <motion.main
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex-1 overflow-y-auto px-6 py-6 relative z-10 flex flex-col gap-6"
      >
        <motion.header variants={itemVariants} className="text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20 mb-3"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[11px] font-medium text-violet-300">AI 驱动的智能课件生成</span>
          </motion.div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            您今天想为哪门课备课？
          </h1>
          <p className="text-sm text-zinc-500 mt-2">
            描述您的教学目标，AI 将为您生成专业的教学课件
          </p>
        </motion.header>

        <motion.section variants={itemVariants}>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-zinc-400" />
            <span className="text-xs font-medium text-zinc-300">选择内容类型</span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {CONTENT_TYPES.map((type) => {
              const isSelected = selectedType === type.id;
              return (
                <motion.button
                  key={type.id}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedType(type.id)}
                  className={cn(
                    "relative p-4 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-300",
                    "border backdrop-blur-sm",
                    isSelected
                      ? `bg-gradient-to-br ${type.gradient} border-transparent shadow-lg shadow-purple-500/20`
                      : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                  )}
                >
                  <motion.span
                    className="text-2xl"
                    animate={{ scale: isSelected ? 1.15 : 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
                    {type.emoji}
                  </motion.span>
                  <span className="text-sm font-medium">{type.name}</span>
                  <span
                    className={cn(
                      "text-[10px] transition-opacity",
                      isSelected ? "opacity-80" : "opacity-50"
                    )}
                  >
                    {type.description}
                  </span>
                  {isSelected && (
                    <motion.div
                      layoutId="type-glow-full"
                      className="absolute inset-0 rounded-2xl bg-white/10"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
        </motion.section>

        <motion.section variants={itemVariants} className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] font-medium text-zinc-400">页面数量</span>
            </div>
            <Select value={pageCount} onValueChange={setPageCount}>
              <SelectTrigger className="w-full h-10 bg-white/5 border-white/10 text-white text-xs hover:bg-white/10 focus:ring-violet-500/50 transition-colors">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-white/10 text-white shadow-xl">
                {PAGE_COUNTS.map((item) => (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                    className="text-xs focus:bg-white/10 focus:text-white"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{item.label}</span>
                      <span className="text-zinc-500 text-[10px] ml-2">{item.desc}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] font-medium text-zinc-400">教学受众</span>
            </div>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger className="w-full h-10 bg-white/5 border-white/10 text-white text-xs hover:bg-white/10 focus:ring-violet-500/50 transition-colors">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-white/10 text-white shadow-xl">
                {AUDIENCES.map((item) => (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                    className="text-xs focus:bg-white/10 focus:text-white"
                  >
                    <span className="mr-1.5">{item.icon}</span>
                    <span>{item.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] font-medium text-zinc-400">输出语言</span>
            </div>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-full h-10 bg-white/5 border-white/10 text-white text-xs hover:bg-white/10 focus:ring-violet-500/50 transition-colors">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-white/10 text-white shadow-xl">
                {LANGUAGES.map((item) => (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                    className="text-xs focus:bg-white/10 focus:text-white"
                  >
                    <span className="mr-1.5">{item.flag}</span>
                    <span>{item.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </motion.section>

        <motion.section variants={itemVariants}>
          <div className="relative bg-white/5 rounded-2xl border border-white/10 focus-within:border-violet-500/50 focus-within:ring-2 focus-within:ring-violet-500/20 transition-all backdrop-blur-sm">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述您的教学目标、核心知识点，或直接粘贴教材内容...&#10;&#10;例如：生成一份关于《光合作用》的初中生物课件，包含实验演示和互动提问"
              className="w-full min-h-[120px] p-4 resize-none bg-transparent outline-none text-sm text-white placeholder:text-zinc-500 leading-relaxed"
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              <span className="text-[10px] text-zinc-500">{prompt.length} / 500</span>
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                className={cn(
                  "h-9 px-5 text-xs font-medium border-0 shadow-lg transition-all",
                  prompt.trim()
                    ? `bg-gradient-to-r ${selectedTypeConfig?.gradient || "from-violet-500 to-purple-500"} hover:shadow-xl hover:scale-105`
                    : "bg-zinc-700 text-zinc-400"
                )}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                开始生成
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </motion.section>

        <motion.section variants={itemVariants}>
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
            <div className="flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs text-zinc-400 font-medium">示例教学提示</span>
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {prompts.map((text, index) => (
              <motion.button
                key={index}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setPrompt(text)}
                className="p-3 rounded-xl bg-white/5 text-xs text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer transition-all text-left line-clamp-2 border border-white/5 hover:border-white/10"
              >
                {text}
              </motion.button>
            ))}
          </div>

          <div className="flex justify-center mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={shufflePrompts}
              className="text-zinc-500 hover:text-white hover:bg-white/5 h-8 text-xs"
            >
              <RefreshCw className="w-3 h-3 mr-1.5" />
              换一组提示
            </Button>
          </div>
        </motion.section>
      </motion.main>
    </div>
  );
}
