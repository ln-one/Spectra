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
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-sm bg-background/80 border-b"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-zinc-50 flex items-center justify-center shadow-sm border border-zinc-100">
              <BrandMark className="w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight text-zinc-900">Spectra</span>
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
