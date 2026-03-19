import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { LightRays } from "@/components/ui/light-rays";

export function ProjectDetailLoading() {
  return (
    <div className="h-screen bg-zinc-100 flex items-center justify-center relative overflow-hidden">
      <LightRays
        count={8}
        color="rgba(180, 200, 255, 0.15)"
        blur={40}
        speed={16}
        length="80vh"
        className="opacity-70"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-3 relative z-10"
      >
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        <span className="text-sm text-zinc-500">加载中...</span>
      </motion.div>
    </div>
  );
}

export function ProjectDetailNotFound({
  onBack,
}: {
  onBack: () => void;
}) {
  return (
    <div className="h-screen bg-zinc-100 flex items-center justify-center relative overflow-hidden">
      <LightRays
        count={8}
        color="rgba(180, 200, 255, 0.15)"
        blur={40}
        speed={16}
        length="80vh"
        className="opacity-70"
      />
      <div className="text-center relative z-10">
        <p className="text-zinc-600">项目不存在</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-zinc-900 text-white text-sm rounded-full hover:bg-zinc-800 transition-colors"
        >
          返回项目列表
        </button>
      </div>
    </div>
  );
}
