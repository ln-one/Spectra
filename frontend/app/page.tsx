"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Sparkles,
  FileText,
  ArrowRight,
  Layers,
  Palette,
  BookOpen,
  Wand2,
  Clock,
  Star,
  Users,
  ChevronRight,
  X,
  Play,
} from "lucide-react";

import { TokenStorage } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LightRays } from "@/components/ui/light-rays";
import { WordRotate } from "@/components/ui/word-rotate";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// 功能特色数据
const features = [
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

// 使用流程步骤
const steps = [
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

// 统计数据
const stats = [
  { value: "10K+", label: "活跃用户", icon: Users },
  { value: "50K+", label: "生成课件", icon: FileText },
  { value: "99%", label: "满意度", icon: Star },
  { value: "24/7", label: "AI 支持", icon: Clock },
];

// 用户评价
const testimonials = [
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

function Navbar() {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-sm bg-background/80 border-b"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl tracking-tight">Spectra</span>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <Link
              href="#features"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              功能
            </Link>
            <Link
              href="#workflow"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              流程
            </Link>
            <Link
              href="#testimonials"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              评价
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth/login">登录</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth/register">注册</Link>
            </Button>
          </div>
        </div>
      </div>
    </motion.nav>
  );
}

function HeroSection({ onShowVideo }: { onShowVideo: () => void }) {
  const prefersReducedMotion = useReducedMotion() ?? false;

  const rotateWords = ["课件创作", "高效备课", "智能教学", "AI 辅助"];

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Light Rays 背景 */}
      <LightRays
        count={10}
        color="rgba(120, 119, 198, 0.15)"
        blur={40}
        speed={18}
        length="50vh"
      />

      {/* 装饰性渐变 */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6 }}
          className="mb-6"
        >
          <Badge
            variant="secondary"
            className="gap-2 px-4 py-1.5 text-sm shadow-sm"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI 驱动的教学革命
          </Badge>
        </motion.div>

        {/* 主标题 */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.8,
            delay: prefersReducedMotion ? 0 : 0.1,
          }}
          className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6"
        >
          用 AI 重新定义
          <br />
          <WordRotate
            words={rotateWords}
            duration={2000}
            className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-600"
          />
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.6,
            delay: prefersReducedMotion ? 0 : 0.3,
          }}
          className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Spectra 帮助教育工作者快速创建专业、精美的教学课件
          <br />
          让备课更高效，让课堂更精彩
        </motion.p>

        {/* CTA 按钮 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.6,
            delay: prefersReducedMotion ? 0 : 0.5,
          }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <Button size="lg" className="h-12 px-8 text-base" asChild>
            <Link href="/auth/register">
              免费开始
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 px-8 text-base"
            onClick={onShowVideo}
          >
            <Play className="mr-2 h-4 w-4" />
            观看演示
          </Button>
        </motion.div>

        {/* 信任标识 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.6,
            delay: prefersReducedMotion ? 0 : 1,
          }}
          className="mt-16"
        >
          <p className="text-sm text-muted-foreground mb-4">
            受到全国 1000+ 学校的信赖
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 opacity-60">
            {[
              "清华大学附属中学",
              "北京大学附属中学",
              "中国人民大学附中",
              "北京师范大学附中",
            ].map((school) => (
              <span
                key={school}
                className="text-sm font-medium text-muted-foreground"
              >
                {school}
              </span>
            ))}
          </div>
        </motion.div>
      </div>

      {/* 滚动提示 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          duration: prefersReducedMotion ? 0 : 0.6,
          delay: prefersReducedMotion ? 0 : 1.5,
        }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="flex flex-col items-center gap-2 text-muted-foreground"
        >
          <span className="text-xs">探索更多</span>
          <ChevronRight className="h-4 w-4 rotate-90" />
        </motion.div>
      </motion.div>
    </section>
  );
}

function StatsSection() {
  const prefersReducedMotion = useReducedMotion() ?? false;

  return (
    <section className="py-16 border-y bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.5,
                delay: prefersReducedMotion ? 0 : index * 0.1,
              }}
              className="text-center"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-3">
                <stat.icon className="h-6 w-6 text-primary" />
              </div>
              <div className="text-3xl md:text-4xl font-bold mb-1">
                {stat.value}
              </div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const prefersReducedMotion = useReducedMotion() ?? false;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: prefersReducedMotion ? 0 : 0.5 },
    },
  };

  return (
    <section id="features" className="py-20 md:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6 }}
          className="text-center mb-16"
        >
          <Badge variant="outline" className="mb-4">
            核心功能
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            为现代教学而生
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            强大的功能组合，让课件创作变得简单高效
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {features.map((feature) => (
            <motion.div key={feature.title} variants={itemVariants}>
              <Card className="h-full group hover:shadow-lg transition-all duration-300 border-border/50 hover:border-border overflow-hidden">
                <CardHeader className="p-6">
                  <div
                    className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} shadow-lg group-hover:scale-110 transition-transform duration-300`}
                  >
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                  <CardDescription className="text-sm leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  const prefersReducedMotion = useReducedMotion() ?? false;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: prefersReducedMotion ? 0 : 0.5 },
    },
  };

  return (
    <section
      id="workflow"
      className="py-20 md:py-32 bg-gradient-to-b from-muted/50 to-background"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6 }}
          className="text-center mb-16"
        >
          <Badge variant="outline" className="mb-4">
            工作流程
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            简单四步，完成课件创作
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            从想法到成品，从未如此简单
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="relative"
        >
          {/* 连接线 */}
          <div className="hidden lg:block absolute top-20 left-1/4 right-1/4 h-px bg-gradient-to-r from-primary/0 via-primary/30 to-primary/0" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step) => (
              <motion.div
                key={step.number}
                variants={itemVariants}
                className="relative"
              >
                <div className="text-center">
                  <div className="relative inline-flex mb-6">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-xl">
                      <step.icon className="h-8 w-8 text-primary-foreground" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-background border-2 border-primary flex items-center justify-center text-xs font-bold">
                      {step.number}
                    </div>
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  const prefersReducedMotion = useReducedMotion() ?? false;

  return (
    <section id="testimonials" className="py-20 md:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6 }}
          className="text-center mb-16"
        >
          <Badge variant="outline" className="mb-4">
            用户评价
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            来自一线教师的声音
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            看看其他老师如何使用 Spectra 提升教学质量
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.5,
                delay: prefersReducedMotion ? 0 : index * 0.1,
              }}
            >
              <Card className="h-full hover:shadow-lg transition-shadow duration-300">
                <CardHeader className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage
                        src={testimonial.avatar}
                        alt={testimonial.name}
                      />
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {testimonial.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-base">
                        {testimonial.name}
                      </CardTitle>
                      <CardDescription>{testimonial.role}</CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-1 mb-3">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star
                        key={i}
                        className="h-4 w-4 fill-warning text-warning"
                      />
                    ))}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    &ldquo;{testimonial.content}&rdquo;
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection({ onShowVideo }: { onShowVideo: () => void }) {
  const prefersReducedMotion = useReducedMotion() ?? false;

  return (
    <section className="py-20 md:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
        >
          <Card className="overflow-hidden border-0 shadow-2xl bg-gradient-to-br from-primary via-primary/95 to-purple-600/90">
            <CardContent className="p-8 md:p-16 text-center text-primary-foreground relative">
              {/* 装饰性光效 */}
              <div className="absolute inset-0 bg-gradient-to-r from-white/5 via-transparent to-white/5" />
              <LightRays
                count={5}
                color="rgba(255, 255, 255, 0.12)"
                blur={50}
                speed={15}
                length="60vh"
              />

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  duration: prefersReducedMotion ? 0 : 0.5,
                  delay: prefersReducedMotion ? 0 : 0.2,
                }}
                className="relative z-10"
              >
                {/* 图标装饰 */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  whileInView={{ scale: 1, rotate: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.6,
                    delay: 0.3,
                    type: "spring",
                    stiffness: 200,
                  }}
                  className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-lg"
                >
                  <Sparkles className="w-8 h-8 text-white" />
                </motion.div>

                <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight">
                  准备好开始创作了吗？
                </h2>
                <p className="text-primary-foreground/80 mb-10 max-w-xl mx-auto text-lg md:text-xl leading-relaxed">
                  立即注册，体验 AI 驱动的高效课件创作流程
                  <br />
                  <span className="text-primary-foreground/60 text-base md:text-lg">
                    已帮助 10,000+ 教师节省 50,000+ 小时备课时间
                  </span>
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                  <Button
                    size="lg"
                    variant="secondary"
                    className="h-14 px-10 text-base shadow-2xl hover:shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:scale-105 transition-all duration-300 group"
                    asChild
                  >
                    <Link href="/auth/register">
                      免费注册
                      <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-14 px-10 text-base bg-white/10 backdrop-blur-sm border-white/30 hover:bg-white/20 hover:border-white/50 transition-all duration-300"
                    onClick={onShowVideo}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    观看演示
                  </Button>
                </div>

                {/* 信任标识 */}
                <motion.div
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.6, duration: 0.8 }}
                  className="mt-12 pt-8 border-t border-white/10"
                >
                  <p className="text-sm text-primary-foreground/50 mb-4">
                    无需信用卡 · 14 天免费试用 · 随时取消
                  </p>
                  <div className="flex items-center justify-center gap-6 text-primary-foreground/40">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-400/60" />
                      <span className="text-sm">安全加密</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-400/60" />
                      <span className="text-sm">隐私保护</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-purple-400/60" />
                      <span className="text-sm">专业支持</span>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="py-12 border-t bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div>
            <h4 className="font-semibold mb-4">产品</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="#features" className="hover:text-foreground">
                  功能
                </Link>
              </li>
              <li>
                <Link href="#workflow" className="hover:text-foreground">
                  流程
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground">
                  定价
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">资源</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="#" className="hover:text-foreground">
                  文档
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground">
                  教程
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground">
                  API
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">公司</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="#" className="hover:text-foreground">
                  关于我们
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground">
                  联系方式
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground">
                  加入我们
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">法律</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="#" className="hover:text-foreground">
                  隐私政策
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground">
                  使用条款
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground">
                  Cookie 政策
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <Separator className="mb-8" />

        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">Spectra</span>
            <span className="text-muted-foreground">
              © 2024 AI-powered courseware creation platform
            </span>
          </div>
          <div className="flex gap-6">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Users className="h-5 w-5 hover:text-foreground transition-colors" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>关注我们</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </footer>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="h-10 w-10 text-muted-foreground" />
        </motion.div>
        <p className="mt-4 text-sm text-muted-foreground">加载中...</p>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [showVideoModal, setShowVideoModal] = useState(false);

  useEffect(() => {
    const token = TokenStorage.getAccessToken();
    // 已登录用户重定向到项目页面
    if (token) {
      router.push("/projects");
      return;
    }

    const frame = requestAnimationFrame(() => {
      setIsLoading(false);
    });

    return () => cancelAnimationFrame(frame);
  }, [router]);

  // 加载中
  if (isLoading) {
    return <LoadingState />;
  }

  // 未登录用户显示欢迎页
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection onShowVideo={() => setShowVideoModal(true)} />
      <StatsSection />
      <FeaturesSection />
      <WorkflowSection />
      <TestimonialsSection />
      <CTASection onShowVideo={() => setShowVideoModal(true)} />
      <Footer />

      {/* 视频弹窗 */}
      <AnimatePresence>
        {showVideoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setShowVideoModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="relative w-full max-w-4xl mx-4 bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <h3 className="text-lg font-semibold text-white">产品演示</h3>
                <button
                  onClick={() => setShowVideoModal(false)}
                  className="p-2 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="aspect-video bg-zinc-800 flex flex-col items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-zinc-700 flex items-center justify-center mb-4">
                  <Play className="w-8 h-8 text-zinc-400 ml-1" />
                </div>
                <p className="text-zinc-400 text-lg">演示视频暂未上线</p>
                <p className="text-zinc-500 text-sm mt-2">敬请期待</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
