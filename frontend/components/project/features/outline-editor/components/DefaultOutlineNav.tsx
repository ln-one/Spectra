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
  onPreview?: () => void;
  onHelp?: () => void;
}

export function DefaultOutlineNav({
  topic,
  slideCount,
  onBack,
  onPreview,
  onHelp,
}: DefaultOutlineNavProps) {
  return (
    <motion.nav
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      className="h-14 px-4 lg:px-6 flex items-center justify-between w-full border-b border-zinc-200/80 bg-white/80 backdrop-blur-sm shrink-0"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          ·µ»ØÏîÄ¿
        </Button>
        <div className="h-4 w-px bg-zinc-200" />
        <span className="truncate text-sm font-medium text-zinc-800 max-w-[320px]">
          {topic}
        </span>
        <Badge
          variant="secondary"
          className="border-blue-200 bg-blue-50 text-blue-700 text-[10px]"
        >
          {slideCount} Ò³
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onPreview}
          className="border-zinc-200 text-zinc-600 hover:bg-zinc-50"
        >
          <Eye className="w-4 h-4 mr-1.5" />
          Ô¤ÀÀ
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onHelp}
          className="text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
        >
          <HelpCircle className="w-4 h-4 mr-1.5" />
          °ïÖú
        </Button>
      </div>
    </motion.nav>
  );
}
