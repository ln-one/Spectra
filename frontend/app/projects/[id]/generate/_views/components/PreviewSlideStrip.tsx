import { motion } from "framer-motion";
import { Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type SlideItem = {
  id?: string;
  index: number;
  title?: string;
  thumbnail_url?: string;
};

interface PreviewSlideStripProps {
  slides: SlideItem[];
  activeSlideIndex: number;
  onScrollToSlide: (index: number) => void;
  onRegenerateSlide: (slide: SlideItem) => void;
  regeneratingSlideId?: string | null;
}

export function PreviewSlideStrip({
  slides,
  activeSlideIndex,
  onScrollToSlide,
  onRegenerateSlide,
  regeneratingSlideId,
}: PreviewSlideStripProps) {
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
          const slideKey = slide.id || `slide-${slide.index}`;
          const isRegenerating = regeneratingSlideId === slideKey;
          return (
            <div
              key={`thumb-${slide.id || slide.index}`}
              role="button"
              tabIndex={0}
              onClick={() => onScrollToSlide(slide.index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onScrollToSlide(slide.index);
                }
              }}
              className={cn(
                "relative group h-14 shrink-0 transition-all duration-300 rounded-xl overflow-hidden border-2 text-left flex flex-col justify-end p-2.5",
                isActive
                  ? "w-36 border-primary bg-primary/10 shadow-sm"
                  : "w-20 border-border/50 bg-muted/50 hover:border-primary/40 hover:bg-muted"
              )}
            >
              {slide.thumbnail_url ? (
                <img
                  src={slide.thumbnail_url}
                  alt={slide.title || `第 ${slide.index + 1} 页`}
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent pointer-events-none" />
              <span
                className={cn(
                  "text-[10px] font-bold z-10 truncate absolute top-1.5 left-2 bg-background/60 backdrop-blur rounded px-1.5",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground"
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
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRegenerateSlide(slide);
                }}
                className="absolute right-1.5 top-1.5 z-10 rounded-md bg-background/70 p-1 text-muted-foreground hover:text-foreground"
                title={`重绘第 ${slide.index} 页`}
                disabled={isRegenerating}
              >
                {isRegenerating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
