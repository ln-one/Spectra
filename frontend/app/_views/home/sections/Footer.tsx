import Link from "next/link";
import { Users } from "lucide-react";
import { BrandMark } from "@/components/icons/brand/BrandMark";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function Footer() {
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
              <BrandMark className="w-3.5 h-3.5 text-primary-foreground" />
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
