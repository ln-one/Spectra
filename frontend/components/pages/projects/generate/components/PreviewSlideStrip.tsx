import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type SlideItem = {
  id?: string;
  index: number;
  title?: string;
};

interface PreviewSlideStripProps {
  slides: SlideItem[];
  activeSlideIndex: number;
  onScrollToSlide: (index: number) => void;
}

export function PreviewSlideStrip({ slides, activeSlideIndex, onScrollToSlide }: PreviewSlideStripProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.5, type: "spring", damping: 25 }}
      className="fixed bottom-0 left-0 w-full h-24 bg-background/85 backdrop-blur-md border-t z-40 flex items-center justify-center px-4"
    >
      <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide py-3 px-4 max-w-full">
        {slides.map((slide) => {
          const isActive = activeSlideIndex === slide.index;
          return (
            <button
              key={`thumb-${slide.id || slide.index}`}
              onClick={() => onScrollToSlide(slide.index)}
              className={cn(
                "relative group h-14 shrink-0 transition-all duration-300 rounded-xl overflow-hidden border-2 text-left flex flex-col justify-end p-2.5",
                isActive
                  ? "w-36 border-primary bg-primary/10 shadow-sm"
                  : "w-20 border-border/50 bg-muted/50 hover:border-primary/40 hover:bg-muted"
              )}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent pointer-events-none" />
              <span
                className={cn(
                  "text-[10px] font-bold z-10 truncate absolute top-1.5 left-2 bg-background/60 backdrop-blur rounded px-1.5",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
              >
                {slide.index}
              </span>
              {isActive ? (
                <motion.span
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs font-semibold z-10 truncate text-foreground leading-tight mt-auto block drop-shadow-sm"
                >
                  {slide.title || `第 ${slide.index} 页`}
                </motion.span>
              ) : null}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
