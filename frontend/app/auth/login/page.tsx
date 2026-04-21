"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Suspense } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useNotification } from "@/hooks/use-notification";
import { Loader2, ArrowLeft } from "lucide-react";
import { motion, useReducedMotion, type Easing } from "framer-motion";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/icons/brand/BrandMark";

const loginSchema = z.object({
  email: z.string().min(1, "请输入邮箱").email("请输入有效的邮箱地址"),
  password: z.string().min(8, "密码至少8个字符"),
});

type LoginFormData = z.infer<typeof loginSchema>;

function normalizeRedirectPath(input: string | null | undefined): string {
  if (!input) return "/projects";
  if (!input.startsWith("/")) return "/projects";
  if (input.startsWith("//")) return "/projects";
  return input;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isSubmitting } = useAuthStore();
  const { success, error } = useNotification();
  const prefersReducedMotion = useReducedMotion() ?? false;

  const redirect = normalizeRedirectPath(searchParams?.get("redirect"));

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      await login(data.email, data.password);
      success("登录成功", "欢迎回来！");
      router.push(redirect);
    } catch (err) {
      console.error("[Login] Error:", err);
      error("登录失败", err instanceof Error ? err.message : "请稍后重试");
    }
  };

  const formVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: prefersReducedMotion ? 0 : 0.6,
        ease: "easeOut" as Easing,
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: prefersReducedMotion ? 0 : 0.4 },
    },
  };

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Left Panel: Image */}
      <div className="hidden lg:flex relative w-1/2 bg-zinc-950 overflow-hidden items-center justify-center">
        <Image
          src="/images/prism_core_bg.png"
          alt="Knowledge Prism Background"
          fill
          className="object-cover opacity-90"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-zinc-950/20" />
        
        {/* Quote / Branding on image */}
        <div className="absolute bottom-12 left-12 right-12 z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
          >
            <h2 className="text-3xl font-bold text-white tracking-tight mb-4 leading-tight">
              折射思维的光芒
            </h2>
            <p className="text-zinc-400 text-lg font-medium tracking-wide">
              AI 驱动的教学革命，从这里开始。
            </p>
          </motion.div>
        </div>
      </div>

      {/* Right Panel: Form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center relative p-8">
        
        {/* Back Button */}
        <div className="absolute top-8 left-8">
          <Link href="/" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回首页
          </Link>
        </div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={formVariants}
          className="w-full max-w-[400px] space-y-8"
        >
          {/* Header */}
          <div className="text-center space-y-6">
            <motion.div variants={itemVariants} className="flex justify-center">
              <BrandMark className="w-48 h-48" />
            </motion.div>
            <motion.div variants={itemVariants}>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                欢迎回来
              </h1>
              <p className="text-muted-foreground mt-2">
                登录您的 Spectra 账号
              </p>
            </motion.div>
          </div>

          {/* Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <motion.div variants={itemVariants}>
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">邮箱</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="your@email.com"
                            type="email"
                            disabled={isSubmitting}
                            className="h-12 bg-zinc-50/50 border-zinc-200/60 focus-visible:ring-blue-500/20 focus-visible:border-blue-500/50 transition-all rounded-xl"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
              </motion.div>

              <motion.div variants={itemVariants}>
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="text-foreground">密码</FormLabel>
                        <Link href="#" className="text-xs font-medium text-zinc-400 hover:text-zinc-900 transition-colors">
                          忘记密码？
                        </Link>
                      </div>
                      <FormControl>
                        <Input
                          placeholder="••••••••"
                          type="password"
                          disabled={isSubmitting}
                          className="h-12 bg-zinc-50/50 border-zinc-200/60 focus-visible:ring-blue-500/20 focus-visible:border-blue-500/50 transition-all rounded-xl"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </motion.div>

              <motion.div variants={itemVariants} className="pt-2">
                <Button
                  type="submit"
                  className="w-full h-12 text-base font-semibold shadow-xl hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99] transition-all bg-zinc-900 text-white hover:bg-zinc-800 rounded-xl relative overflow-hidden group"
                  disabled={isSubmitting}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:animate-shimmer" />
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      登录中...
                    </>
                  ) : (
                    "登录"
                  )}
                </Button>
              </motion.div>

              <motion.div
                variants={itemVariants}
                className="text-center text-sm text-muted-foreground pt-4"
              >
                还没有账号？{" "}
                <Link
                  href="/auth/register"
                  className="text-foreground hover:text-blue-600 font-medium hover:underline transition-colors"
                >
                  立即注册
                </Link>
              </motion.div>
            </form>
          </Form>
        </motion.div>
      </div>
    </div>
  );
}

function LoginLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}
