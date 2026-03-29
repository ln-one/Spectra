import type { ComponentType } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCcw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/sdk/types";
import type { EditQueueItem } from "@/lib/project/preview-workbench";

type Slide = components["schemas"]["Slide"];

const INSTRUCTION_TEMPLATES = [
  "Clarify the key concept with a shorter explanation.",
  "Add one practical classroom example on this slide.",
  "Improve flow from previous slide and add transition language.",
  "Keep layout but simplify wording for younger students.",
];

interface PreviewRightPanelProps {
  slides: Slide[];
  selectedSlideIndex: number | null;
  instruction: string;
  queue: EditQueueItem[];
  isSubmittingEdit: boolean;
  supportsImageEditing: boolean;
  onInstructionChange: (value: string) => void;
  onSelectSlideIndex: (index: number) => void;
  onUseTemplate: (template: string) => void;
  onSubmitEdit: () => void;
  onRetryQueueItem: (itemId: string) => void;
}

function statusMeta(status: EditQueueItem["status"]): {
  label: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
} {
  switch (status) {
    case "submitted":
      return {
        label: "Submitted",
        icon: Clock3,
        tone: "text-amber-700 bg-amber-100 border-amber-200",
      };
    case "processing":
      return {
        label: "Processing",
        icon: Loader2,
        tone: "text-blue-700 bg-blue-100 border-blue-200",
      };
    case "success":
      return {
        label: "Success",
        icon: CheckCircle2,
        tone: "text-emerald-700 bg-emerald-100 border-emerald-200",
      };
    case "failed":
      return {
        label: "Failed",
        icon: XCircle,
        tone: "text-rose-700 bg-rose-100 border-rose-200",
      };
    case "conflict":
      return {
        label: "Conflict",
        icon: AlertTriangle,
        tone: "text-orange-700 bg-orange-100 border-orange-200",
      };
    default:
      return {
        label: "Unknown",
        icon: Clock3,
        tone: "text-muted-foreground bg-muted border-border",
      };
  }
}

export function PreviewRightPanel({
  slides,
  selectedSlideIndex,
  instruction,
  queue,
  isSubmittingEdit,
  supportsImageEditing,
  onInstructionChange,
  onSelectSlideIndex,
  onUseTemplate,
  onSubmitEdit,
  onRetryQueueItem,
}: PreviewRightPanelProps) {
  const selectedSlide =
    typeof selectedSlideIndex === "number"
      ? slides.find((slide) => slide.index === selectedSlideIndex) || null
      : null;
  const canSubmit = Boolean(selectedSlide && instruction.trim());

  return (
    <aside className="h-full border-l bg-muted/20 overflow-y-auto p-4 space-y-4">
      <section className="rounded-xl border bg-background p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            AI Redo
          </p>
          <h3 className="text-sm font-semibold">Slide edit request</h3>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Target slide</p>
          <div className="grid grid-cols-4 gap-2">
            {slides.slice(0, 12).map((slide) => (
              <Button
                key={slide.id || `target-${slide.index}`}
                type="button"
                size="sm"
                variant={selectedSlideIndex === slide.index ? "default" : "outline"}
                className="h-8 px-2 text-xs"
                onClick={() => onSelectSlideIndex(slide.index)}
              >
                {slide.index + 1}
              </Button>
            ))}
          </div>
          {selectedSlide ? (
            <p className="text-xs text-muted-foreground">
              Editing: {selectedSlide.title || `Slide ${selectedSlide.index + 1}`}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Select a slide from left panel or buttons above.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Templates</p>
          <div className="flex flex-wrap gap-2">
            {INSTRUCTION_TEMPLATES.map((template) => (
              <Button
                key={template}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => onUseTemplate(template)}
              >
                Use
              </Button>
            ))}
          </div>
        </div>

        <Textarea
          value={instruction}
          onChange={(event) => onInstructionChange(event.target.value)}
          placeholder="Describe how this slide should be revised..."
          className="min-h-[120px] resize-y text-sm"
        />

        <Button
          type="button"
          className="w-full"
          disabled={!canSubmit || isSubmittingEdit}
          onClick={onSubmitEdit}
        >
          {isSubmittingEdit ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting
            </>
          ) : (
            "Submit Redo Request"
          )}
        </Button>
      </section>

      <section className="rounded-xl border bg-background p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Edit Queue
          </p>
          <h3 className="text-sm font-semibold">Execution status</h3>
        </div>
        <div className="space-y-2">
          {queue.map((item) => {
            const meta = statusMeta(item.status);
            const Icon = meta.icon;
            return (
              <div
                key={item.id}
                className="rounded-lg border bg-background px-3 py-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">Slide {item.slideIndex + 1}</p>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
                      meta.tone
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-3 w-3",
                        item.status === "processing" ? "animate-spin" : ""
                      )}
                    />
                    {meta.label}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-muted-foreground">
                  {item.instruction}
                </p>
                <p className="mt-1 text-muted-foreground">{item.message}</p>
                {item.status === "conflict" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 px-2 text-[11px]"
                    onClick={() => onRetryQueueItem(item.id)}
                  >
                    <RefreshCcw className="mr-1 h-3 w-3" />
                    Retry with latest version
                  </Button>
                ) : null}
              </div>
            );
          })}
          {queue.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-xs text-muted-foreground">
              No edit jobs yet.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border bg-background p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Image Operations
          </p>
          <h3 className="text-sm font-semibold">Replace / Insert image</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          This entry is wired on frontend and currently gated by backend capability.
        </p>
        <div className="space-y-2">
          <Button type="button" className="w-full" disabled={!supportsImageEditing}>
            Replace image (gated)
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!supportsImageEditing}
          >
            Insert image block (gated)
          </Button>
        </div>
        {!supportsImageEditing ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
            Backend support required: structured patch execution for image ops,
            artifact replacement response, and page-level result tracing.
          </p>
        ) : null}
      </section>
    </aside>
  );
}
