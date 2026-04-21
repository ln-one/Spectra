import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BrandMark } from "@/components/icons/brand/BrandMark";
import { LightRays } from "@/components/ui/light-rays";

export function CTASection({ onShowVideo }: { onShowVideo: () => void }) {
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
                  <BrandMark className="w-8 h-8 text-white" />
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
