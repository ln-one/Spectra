"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Eye, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { itemVariants } from "../constants";

interface DefaultOutlineNavProps {
  topic: string;
  slideCount: number;
  onBack?: () => void;
}

export function DefaultOutlineNav({ topic, slideCount, onBack }: DefaultOutlineNavProps) {
  return (
    <motion.nav
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      className="h-14 px-4 lg:px-6 flex items-center justify-between w-full border-b border-zinc-200/70 bg-white/90 backdrop-blur-md shrink-0"
    >
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100">
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回项目
        </Button>
        <div className="h-4 w-px bg-zinc-200" />
        <span className="text-sm font-medium text-zinc-700">{topic}</span>
        <Badge variant="secondary" className="bg-violet-100 text-violet-700 border-violet-200 text-[10px]">
          {slideCount} 页
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 border-zinc-200">
          <Eye className="w-4 h-4 mr-1.5" />
          预览
        </Button>
        <Button variant="ghost" size="sm" className="text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100">
          <HelpCircle className="w-4 h-4 mr-1.5" />
          帮助
        </Button>
      </div>
    </motion.nav>
  );
}
