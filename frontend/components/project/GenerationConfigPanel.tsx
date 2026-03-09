"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Presentation, FileText, HelpCircle, Brain, Sparkles, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
  },
  {
    id: "document",
    name: "结构教案",
    icon: FileText,
    emoji: "📄",
  },
  {
    id: "quiz",
    name: "互动测验",
    icon: HelpCircle,
    emoji: "📱",
  },
  {
    id: "mindmap",
    name: "知识图谱",
    icon: Brain,
    emoji: "🗺️",
  },
];

const PAGE_COUNTS = [
  { value: "10", label: "10 页" },
  { value: "15", label: "15 页" },
  { value: "20", label: "20 页" },
  { value: "25", label: "25 页" },
];

const AUDIENCES = [
  { value: "k12", label: "K12 基础教育" },
  { value: "higher", label: "高等教育" },
  { value: "enterprise", label: "企业培训" },
  { value: "general", label: "通用教育" },
];

const LANGUAGES = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
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
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 24,
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
  onGenerate
}: GenerationConfigPanelProps) {
  const [selectedType, setSelectedType] = useState<string>("presentation");
  const [pageCount, setPageCount] = useState<string>("15");
  const [audience, setAudience] = useState<string>("k12");
  const [language, setLanguage] = useState<string>("zh-CN");
  const [prompt, setPrompt] = useState<string>("");
  const [prompts, setPrompts] = useState<string[]>(INSPIRATION_PROMPTS.slice(0, 6));
  const [showOutlineEditor, setShowOutlineEditor] = useState(false);
  const [generatedConfig, setGeneratedConfig] = useState<GenerationConfig | null>(null);

  const shufflePrompts = () => {
    const shuffled = [...INSPIRATION_PROMPTS].sort(() => Math.random() - 0.5);
    setPrompts(shuffled.slice(0, 6));
  };

  const handleGenerate = () => {
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
  };

  const handleBackFromOutline = () => {
    setShowOutlineEditor(false);
  };

  const handleConfirmOutline = () => {
  };

  const handleGoToPreview = () => {
  };

  if (variant === "compact") {
    return (
      <AnimatePresence mode="wait">
        {showOutlineEditor ? (
          <motion.div
            key="outline-editor"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
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
            className="flex flex-col gap-3"
          >
            <motion.div variants={itemVariants}>
              <p className="text-[10px] font-medium text-zinc-500 mb-2 text-center">
                选择内容类型
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {CONTENT_TYPES.map((type) => {
                  const isSelected = selectedType === type.id;
                  return (
                    <motion.button
                      key={type.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedType(type.id)}
                      className={cn(
                        "relative p-2 rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer transition-all duration-200",
                        "bg-white/80 border",
                        "hover:bg-white",
                        isSelected
                          ? "border-orange-300 ring-1 ring-orange-200 bg-orange-50/50"
                          : "border-zinc-200/60"
                      )}
                    >
                      <span className="text-base">{type.emoji}</span>
                      <span className="text-[9px] font-medium text-zinc-600">
                        {type.name}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>

            <motion.div variants={itemVariants} className="flex gap-1.5 justify-center flex-wrap">
              <Select value={pageCount} onValueChange={setPageCount}>
                <SelectTrigger className="w-20 h-7 bg-white/80 border-zinc-200/60 text-zinc-700 text-[10px] hover:bg-white">
                  <SelectValue placeholder="页面数量" />
                </SelectTrigger>
                <SelectContent className="bg-white border-zinc-200 text-zinc-700">
                  {PAGE_COUNTS.map((item) => (
                    <SelectItem
                      key={item.value}
                      value={item.value}
                      className="text-[10px] focus:bg-zinc-100"
                    >
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger className="w-24 h-7 bg-white/80 border-zinc-200/60 text-zinc-700 text-[10px] hover:bg-white">
                  <SelectValue placeholder="教学受众" />
                </SelectTrigger>
                <SelectContent className="bg-white border-zinc-200 text-zinc-700">
                  {AUDIENCES.map((item) => (
                    <SelectItem
                      key={item.value}
                      value={item.value}
                      className="text-[10px] focus:bg-zinc-100"
                    >
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-20 h-7 bg-white/80 border-zinc-200/60 text-zinc-700 text-[10px] hover:bg-white">
                  <SelectValue placeholder="输出语言" />
                </SelectTrigger>
                <SelectContent className="bg-white border-zinc-200 text-zinc-700">
                  {LANGUAGES.map((item) => (
                    <SelectItem
                      key={item.value}
                      value={item.value}
                      className="text-[10px] focus:bg-zinc-100"
                    >
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </motion.div>

            <motion.div variants={itemVariants}>
              <div className="relative bg-white/60 rounded-lg border border-zinc-200/60 focus-within:border-orange-300 focus-within:ring-1 focus-within:ring-orange-200 transition-all">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="描述您的教学目标、核心知识点..."
                  className="w-full min-h-[60px] p-2.5 resize-none bg-transparent outline-none text-[11px] text-zinc-700 placeholder:text-zinc-400"
                />
                <div className="absolute bottom-2 right-2">
                  <Button
                    size="sm"
                    onClick={handleGenerate}
                    disabled={!prompt.trim()}
                    className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white border-0 h-6 px-2.5 text-[10px] disabled:opacity-50"
                  >
                    <Sparkles className="w-3 h-3 mr-1" />
                    生成
                  </Button>
                </div>
              </div>
            </motion.div>

            <motion.div variants={itemVariants}>
              <div className="flex items-center justify-center gap-2 mb-1.5">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent" />
                <span className="text-[9px] text-zinc-400">示例提示</span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent" />
              </div>

              <div className="grid grid-cols-2 gap-1">
                {prompts.slice(0, 4).map((text, index) => (
                  <motion.button
                    key={index}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => setPrompt(text)}
                    className="p-1.5 rounded-md bg-white/60 text-[9px] text-zinc-500 hover:text-zinc-700 hover:bg-white/80 cursor-pointer transition-colors text-left line-clamp-2 border border-transparent hover:border-zinc-200/60"
                  >
                    {text}
                  </motion.button>
                ))}
              </div>

              <div className="flex justify-center mt-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={shufflePrompts}
                  className="text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 h-5 text-[9px] px-2"
                >
                  <RefreshCw className="w-2.5 h-2.5 mr-0.5" />
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
    <div className="h-full bg-[#1a1d21] text-white flex flex-col relative overflow-hidden rounded-2xl">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-purple-500/20 blur-3xl"
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] rounded-full bg-blue-500/15 blur-3xl"
        />
      </div>

      <motion.nav
        variants={itemVariants}
        className="h-12 px-3 flex items-center justify-between w-full relative z-10 shrink-0"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-gray-400 hover:text-white hover:bg-white/5 h-8"
        >
          返回
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-400 hover:text-white hover:bg-white/5 h-8"
        >
          帮助
        </Button>
      </motion.nav>

      <motion.main
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex-1 overflow-y-auto px-3 pb-4 relative z-10 flex flex-col gap-4"
      >
        <motion.header variants={itemVariants} className="text-center">
          <p className="text-[10px] font-medium text-purple-400 tracking-wider mb-0.5">
            生成光谱
          </p>
          <h1 className="text-lg font-semibold">
            您今天想为哪门课备课？
          </h1>
        </motion.header>

        <motion.section variants={itemVariants}>
          <div className="grid grid-cols-4 gap-2">
            {CONTENT_TYPES.map((type) => {
              const isSelected = selectedType === type.id;
              return (
                <motion.button
                  key={type.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedType(type.id)}
                  className={cn(
                    "relative p-2.5 rounded-xl flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all duration-200",
                    "bg-white/5 border border-white/10",
                    "hover:bg-white/10",
                    isSelected && "ring-2 ring-purple-500 shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                  )}
                >
                  <span className="text-lg">{type.emoji}</span>
                  <span className="text-[10px] font-medium text-white">
                    {type.name}
                  </span>
                  {isSelected && (
                    <motion.div
                      layoutId="type-glow"
                      className="absolute inset-0 rounded-xl bg-gradient-to-br from-purple-500/10 to-blue-500/10"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
        </motion.section>

        <motion.section variants={itemVariants} className="flex gap-2 justify-center flex-wrap">
          <Select value={pageCount} onValueChange={setPageCount}>
            <SelectTrigger className="w-24 h-8 bg-white/5 border-white/10 text-white text-[10px] hover:bg-white/10 focus:ring-purple-500">
              <SelectValue placeholder="页面数量" />
            </SelectTrigger>
            <SelectContent className="bg-[#2a2d31] border-white/10 text-white">
              {PAGE_COUNTS.map((item) => (
                <SelectItem
                  key={item.value}
                  value={item.value}
                  className="text-[10px] focus:bg-white/10 focus:text-white"
                >
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={audience} onValueChange={setAudience}>
            <SelectTrigger className="w-28 h-8 bg-white/5 border-white/10 text-white text-[10px] hover:bg-white/10 focus:ring-purple-500">
              <SelectValue placeholder="教学受众" />
            </SelectTrigger>
            <SelectContent className="bg-[#2a2d31] border-white/10 text-white">
              {AUDIENCES.map((item) => (
                <SelectItem
                  key={item.value}
                  value={item.value}
                  className="text-[10px] focus:bg-white/10 focus:text-white"
                >
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-24 h-8 bg-white/5 border-white/10 text-white text-[10px] hover:bg-white/10 focus:ring-purple-500">
              <SelectValue placeholder="输出语言" />
            </SelectTrigger>
            <SelectContent className="bg-[#2a2d31] border-white/10 text-white">
              {LANGUAGES.map((item) => (
                <SelectItem
                  key={item.value}
                  value={item.value}
                  className="text-[10px] focus:bg-white/10 focus:text-white"
                >
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </motion.section>

        <motion.section variants={itemVariants}>
          <div className="relative bg-black/40 rounded-xl border border-white/10 focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500 transition-all">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述您的教学目标、核心知识点，或直接粘贴教材内容..."
              className="w-full min-h-[80px] p-3 resize-none bg-transparent outline-none text-xs text-white placeholder:text-gray-500"
            />
            <div className="absolute bottom-2 right-2">
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white border-0 h-7 px-3 text-[10px] disabled:opacity-50"
              >
                <Sparkles className="w-3 h-3 mr-1" />
                生成
              </Button>
            </div>
          </div>
        </motion.section>

        <motion.section variants={itemVariants}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent" />
            <span className="text-[10px] text-gray-500">示例教学提示</span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent" />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {prompts.map((text, index) => (
              <motion.button
                key={index}
                whileHover={{ scale: 1.01 }}
                onClick={() => setPrompt(text)}
                className="p-2 rounded-lg bg-white/5 text-[10px] text-gray-300 hover:text-white hover:bg-white/10 cursor-pointer transition-colors text-left line-clamp-2"
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
              className="text-gray-500 hover:text-white hover:bg-white/5 h-6 text-[10px]"
            >
              <RefreshCw className="w-2.5 h-2.5 mr-1" />
              换一组
            </Button>
          </div>
        </motion.section>
      </motion.main>
    </div>
  );
}
