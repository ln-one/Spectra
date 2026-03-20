"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Suspense } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const registerSchema = z
  .object({
    email: z.string().min(1, "请输入邮箱").email("请输入有效的邮箱地址"),
    username: z
      .string()
      .min(3, "用户名至少3个字符")
      .max(50, "用户名最多50个字符")
      .regex(/^[a-zA-Z0-9_-]+$/, "只能包含字母、数字、下划线和连字符"),
    fullName: z.string().max(100, "姓名最多100个字符").optional(),
    password: z
      .string()
      .min(8, "密码至少8个字符")
      .regex(/^(?=.*[a-zA-Z])(?=.*\d)/, "密码必须包含字母和数字"),
    confirmPassword: z.string().min(1, "请确认密码"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register: registerUser, isLoading } = useAuthStore();
  const { toast } = useToast();

  const redirect = searchParams?.get("redirect") || "/projects";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    try {
      await registerUser(
        data.email,
        data.password,
        data.username,
        data.fullName
      );
      toast({
        title: "注册成功",
        description: "正在跳转到项目页面...",
      });
      router.push(redirect);
    } catch (error) {
      toast({
        title: "注册失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold">注册</h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm">
              邮箱
            </label>
            <input
              id="email"
              type="email"
              placeholder="your@email.com"
              {...register("email")}
              disabled={isLoading}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
            {errors.email && (
              <p className="text-xs text-red-500">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="username" className="text-sm">
              用户名
            </label>
            <input
              id="username"
              type="text"
              placeholder="username"
              {...register("username")}
              disabled={isLoading}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
            {errors.username && (
              <p className="text-xs text-red-500">{errors.username.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="fullName" className="text-sm">
              姓名 <span className="text-gray-400">(可选)</span>
            </label>
            <input
              id="fullName"
              type="text"
              placeholder="您的全名"
              {...register("fullName")}
              disabled={isLoading}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
            {errors.fullName && (
              <p className="text-xs text-red-500">{errors.fullName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm">
              密码
            </label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              {...register("password")}
              disabled={isLoading}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
            {errors.password && (
              <p className="text-xs text-red-500">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm">
              确认密码
            </label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              {...register("confirmPassword")}
              disabled={isLoading}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
            {errors.confirmPassword && (
              <p className="text-xs text-red-500">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 bg-black text-white rounded-md text-sm disabled:opacity-50"
          >
            {isLoading ? "注册中..." : "注册"}
          </button>

          <div className="text-center text-sm">
            已有账号？{" "}
            <Link href="/auth/login" className="text-blue-600">
              立即登录
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

function RegisterLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterLoading />}>
      <RegisterForm />
    </Suspense>
  );
}
