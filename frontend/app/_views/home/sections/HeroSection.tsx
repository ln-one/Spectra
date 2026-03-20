import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronRight, Play, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LightRays } from "@/components/ui/light-rays";
import { WordRotate } from "@/components/ui/word-rotate";

export function HeroSection({ onShowVideo }: { onShowVideo: () => void }) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const rotateWords = ["课件创作", "高效备课", "智能教学", "AI 辅助"];

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      <LightRays
        count={10}
        color="rgba(120, 119, 198, 0.15)"
        blur={40}
        speed={18}
        length="50vh"
      />
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
