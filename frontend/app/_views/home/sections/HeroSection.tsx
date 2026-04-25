import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LightRays } from "@/components/ui/light-rays";
import { MorphingText } from "@/components/ui/morphing-text";

export function HeroSection({ onShowVideo }: { onShowVideo: () => void }) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const morphingTexts = ["知识折射", "智慧涌现", "结构生成", "灵感迸发"];

  // Spectra brand colors for light rays
  const spectraColors = [
    "rgba(255, 59, 48, 0.2)",  // Red
    "rgba(255, 204, 0, 0.2)",  // Yellow
    "rgba(90, 200, 250, 0.2)", // Light Blue
    "rgba(175, 82, 222, 0.2)"  // Purple
  ];

  // Colors for dynamic text glow
  const glowColors = [
    "rgba(255, 59, 48, 0.8)",  // Red
    "rgba(255, 204, 0, 0.8)",  // Yellow
    "rgba(90, 200, 250, 0.8)", // Light Blue
    "rgba(175, 82, 222, 0.8)"  // Purple
  ];

  const [currentColorIndex, setCurrentColorIndex] = useState(0);

  useEffect(() => {
    // Morphing time is 1.5s + 0.5s cooldown in morphing-text.tsx
    const interval = setInterval(() => {
      setCurrentColorIndex((prev) => (prev + 1) % glowColors.length);
    }, 2000); 
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16 bg-background">
      
      {/* Right Side Background Image */}
      <div className="absolute inset-0 z-0 flex justify-end pointer-events-none">
        <div className="relative w-full md:w-[65%] h-full">
          {/* A gradient mask to fade the image into the background color on the left */}
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent z-10" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/50 z-10" />
          
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="w-full h-full relative"
          >
            <Image
              src="/images/prism_core_bg.png"
              alt="Spectra Workflow"
              fill
              className="object-cover object-right"
              priority
            />
          </motion.div>
        </div>
      </div>

      {/* Ambient Lighting */}
      <LightRays
        count={10}
        colors={spectraColors}
        blur={50}
        speed={16}
        length="60vh"
        className="z-0 opacity-40 mix-blend-screen"
      />

      {/* Main Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="max-w-2xl text-left space-y-10">
          
          {/* Elegant Subtitle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.6 }}
          >
            <p className="text-xl md:text-2xl text-muted-foreground/80 font-medium tracking-[0.2em] uppercase">
              AI 驱动的教学革命
            </p>
          </motion.div>

          {/* Main Headline */}
          <div className="space-y-4">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.8,
                delay: prefersReducedMotion ? 0 : 0.1,
              }}
              className="text-6xl md:text-7xl lg:text-[5.5rem] font-black tracking-tighter leading-[1.05]"
            >
              用 AI 重新定义
              <br />
              <span 
                className="block mt-6 -ml-4 transition-all duration-1000 ease-in-out"
                style={{ filter: `drop-shadow(0 0 35px ${glowColors[currentColorIndex]})` }}
              >
                <MorphingText texts={morphingTexts} className="text-left text-foreground" />
              </span>
            </motion.h1>
          </div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.6,
              delay: prefersReducedMotion ? 0 : 0.3,
            }}
            className="text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed"
          >
            Spectra 像一面棱镜，将您零散的灵感与素材，折射为结构清晰、设计精美的专业教学课件。
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.6,
              delay: prefersReducedMotion ? 0 : 0.5,
            }}
            className="flex flex-col sm:flex-row gap-4 pt-4"
          >
            <Button size="lg" className="h-14 px-8 text-lg font-medium shadow-2xl bg-zinc-900 text-white hover:bg-zinc-800 transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(0,0,0,0.3)]" asChild>
              <Link href="/auth/register">
                开启知识折射
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 px-8 text-lg font-medium border-border/60 hover:bg-zinc-100/50 transition-all backdrop-blur-sm"
              onClick={onShowVideo}
            >
              <Play className="mr-2 h-4 w-4" />
              体验演示
            </Button>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          duration: prefersReducedMotion ? 0 : 0.6,
          delay: prefersReducedMotion ? 0 : 1.5,
        }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="flex flex-col items-center gap-2 text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer"
          onClick={() => {
            document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <span className="text-xs uppercase tracking-widest font-semibold">向下探索</span>
          <ChevronRight className="h-4 w-4 rotate-90" />
        </motion.div>
      </motion.div>
    </section>
  );
}
