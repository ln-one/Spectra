import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/sdk/types";

type Slide = components["schemas"]["Slide"];

interface PreviewSlideSidebarProps {
  slides: Slide[];
  activeSlideIndex: number;
  selectedEditSlideIndex: number | null;
  isOutlineGenerating: boolean;
  outlineSections: string[];
  onSelectSlide: (index: number) => void;
  onSelectEditSlide: (index: number) => void;
}

export function PreviewSlideSidebar({
  slides,
  activeSlideIndex,
  selectedEditSlideIndex,
  isOutlineGenerating,
  outlineSections,
  onSelectSlide,
  onSelectEditSlide,
}: PreviewSlideSidebarProps) {
  return (
    <aside className="h-full border-r bg-muted/20 overflow-y-auto px-3 py-4 space-y-4">
      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Deck Slides
        </p>
        <div className="space-y-2">
          {slides.map((slide) => {
            const active = slide.index === activeSlideIndex;
            const selected = slide.index === selectedEditSlideIndex;
            return (
              <button
                key={slide.id || `slide-${slide.index}`}
                className={cn(
                  "w-full rounded-xl border px-3 py-2 text-left transition",
                  active
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border bg-background hover:border-primary/40",
                  selected ? "ring-1 ring-primary/40" : ""
                )}
                onClick={() => onSelectSlide(slide.index)}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Page {slide.index + 1}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectEditSlide(slide.index);
                    }}
                  >
                    <Sparkles className="mr-1 h-3 w-3" />
                    Redo
                  </Button>
                </div>
                <p className="mt-1 truncate text-sm font-medium">
                  {slide.title || `Slide ${slide.index + 1}`}
                </p>
              </button>
            );
          })}
          {slides.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-xs text-muted-foreground">
              No slide metadata yet. Preview will appear after generation.
            </p>
          ) : null}
        </div>
      </section>

      {isOutlineGenerating ? (
        <section className="rounded-xl border bg-background px-3 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Outline Stream
          </p>
          <div className="space-y-1 text-xs text-muted-foreground">
            {outlineSections.length === 0 ? (
              <p className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Waiting for outline events
              </p>
            ) : (
              outlineSections.map((section, index) => (
                <p key={`${index}-${section}`}>{index + 1}. {section}</p>
              ))
            )}
          </div>
        </section>
      ) : null}
    </aside>
  );
}
