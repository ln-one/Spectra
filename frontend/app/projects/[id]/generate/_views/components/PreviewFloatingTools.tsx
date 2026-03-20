import { motion } from "framer-motion";
import { Edit3, Image as ImageIcon, Layout, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function PreviewFloatingTools() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.6, duration: 0.4 }}
      className="fixed right-4 md:right-8 top-1/2 -translate-y-1/2 z-40 hidden sm:flex"
    >
      <div className="bg-card/90 border shadow-xl rounded-full flex flex-col p-1.5 gap-1.5 backdrop-blur-xl">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-foreground hover:bg-muted w-10 h-10">
              <Edit3 className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">编辑内容</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-foreground hover:bg-muted w-10 h-10">
              <Layout className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">更换排版</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-foreground hover:bg-muted w-10 h-10">
              <ImageIcon className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">替换配图</TooltipContent>
        </Tooltip>
        <div className="h-px w-5 mx-auto bg-border/80 my-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full text-violet-500 hover:text-violet-600 hover:bg-violet-50 w-10 h-10">
              <Sparkles className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="bg-violet-600 text-white border-violet-700">
            AI 润色
          </TooltipContent>
        </Tooltip>
      </div>
    </motion.div>
  );
}
