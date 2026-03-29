import { Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/sdk/types";

type Slide = components["schemas"]["Slide"];

export function SlideCard({
  slide,
  isActive,
}: {
  slide: Slide;
  isActive: boolean;
}) {
  return (
    <div
      id={slide.id || `slide-${slide.index}`}
      data-index={slide.index}
      className={cn(
        "slide-card bg-card border rounded-2xl p-8 md:p-12 mb-12 shadow-sm transition-all duration-300 w-full min-h-[400px] flex flex-col",
        isActive
          ? "ring-2 ring-primary/20 shadow-md translate-x-1"
          : "hover:shadow-md hover:-translate-y-1"
      )}
    >
      {slide.title && (
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8 text-center md:text-left title-text">
          {slide.title}
        </h2>
      )}

      <div className="flex-1 prose prose-lg dark:prose-invert max-w-none text-muted-foreground prose-h1:text-foreground prose-h2:text-foreground prose-h3:text-foreground prose-strong:text-foreground">
        {slide.content ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {slide.content}
          </ReactMarkdown>
        ) : (
          <div className="flex items-center justify-center h-full opacity-50">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        )}
      </div>

      {slide.sources && slide.sources.length > 0 && (
        <div className="mt-8 pt-4 border-t flex flex-wrap gap-2">
          {slide.sources.map((source, idx) => (
            <span
              key={idx}
              className="text-xs bg-muted/60 text-muted-foreground px-2 py-1 rounded-full border flex items-center gap-1"
            >
              来源 {source.filename}
              {source.page_number && ` (P${source.page_number})`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
