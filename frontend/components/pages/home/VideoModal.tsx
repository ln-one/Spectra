import { AnimatePresence, motion } from "framer-motion";
import { Play, X } from "lucide-react";

interface VideoModalProps {
  open: boolean;
  onClose: () => void;
}

export function VideoModal({ open, onClose }: VideoModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative w-full max-w-4xl mx-4 bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h3 className="text-lg font-semibold text-white">产品演示</h3>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="aspect-video bg-zinc-800 flex flex-col items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-zinc-700 flex items-center justify-center mb-4">
                <Play className="w-8 h-8 text-zinc-400 ml-1" />
              </div>
              <p className="text-zinc-400 text-lg">演示视频暂未上线</p>
              <p className="text-zinc-500 text-sm mt-2">敬请期待</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
