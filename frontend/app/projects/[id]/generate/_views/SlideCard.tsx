import { Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
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
    <section
      id={slide.id || `slide-${slide.index}`}
      data-index={slide.index}
      className={cn(
        "slide-card rounded-2xl border bg-background p-5 md:p-7 shadow-sm transition",
        isActive ? "ring-2 ring-primary/20" : "hover:shadow-md"
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Page {slide.index + 1}
        </p>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled>
          Visual render pending backend support
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-4 md:p-6">
        {slide.title ? (
          <h2 className="mb-4 text-2xl font-semibold text-foreground md:text-3xl">
            {slide.title}
          </h2>
        ) : null}

        <div className="prose prose-sm md:prose-base max-w-none text-muted-foreground prose-headings:text-foreground prose-strong:text-foreground">
          {slide.content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{slide.content}</ReactMarkdown>
          ) : (
            <div className="flex items-center justify-center py-16 opacity-50">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
        </div>
      </div>

      {slide.sources && slide.sources.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {slide.sources.map((source, index) => (
            <span
              key={`${source.chunk_id}-${index}`}
              className="rounded-full border bg-muted px-2 py-1 text-[11px] text-muted-foreground"
            >
              {source.filename}
              {source.page_number ? ` (p${source.page_number})` : ""}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
