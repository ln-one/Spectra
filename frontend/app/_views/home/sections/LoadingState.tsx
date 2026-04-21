import { motion } from "framer-motion";
import { BrandMark } from "@/components/icons/brand/BrandMark";

export function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center justify-center space-y-8">
        <motion.div
          animate={{ 
            scale: [1, 1.05, 1],
            filter: [
              "drop-shadow(0 0 0px rgba(90,200,250,0))",
              "drop-shadow(0 0 20px rgba(90,200,250,0.4))",
              "drop-shadow(0 0 0px rgba(90,200,250,0))"
            ]
          }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <BrandMark className="h-16 w-16" />
        </motion.div>
        <motion.div
           animate={{ opacity: [0.4, 1, 0.4] }}
           transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
           className="flex flex-col items-center gap-2"
        >
          <span className="text-sm font-semibold tracking-[0.3em] uppercase text-zinc-900">
            Spectra
          </span>
          <span className="text-xs font-medium tracking-widest text-muted-foreground/60">
            正在折射知识...
          </span>
        </motion.div>
      </div>
    </div>
  );
}
