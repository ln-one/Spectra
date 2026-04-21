import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/icons/brand/BrandMark";

export function Navbar() {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="absolute top-0 left-0 right-0 z-50 pt-4"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <BrandMark className="w-12 h-12" />
            <span className="font-bold text-3xl tracking-tight text-zinc-900">Spectra</span>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <Link
              href="#features"
              className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              功能
            </Link>
            <Link
              href="#workflow"
              className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              流程
            </Link>
            <Link
              href="#testimonials"
              className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              评价
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/50 rounded-full px-5 transition-all" asChild>
              <Link href="/auth/login">登录</Link>
            </Button>
            <Button size="sm" className="bg-zinc-900 text-white hover:bg-zinc-800 rounded-full px-6 shadow-md transition-all hover:shadow-lg" asChild>
              <Link href="/auth/register">注册</Link>
            </Button>
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
