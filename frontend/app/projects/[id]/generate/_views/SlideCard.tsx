import { useMemo } from "react";
import { Edit3, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/sdk/types";
import { HtmlPreviewFrame } from "./components/HtmlPreviewFrame";

type Slide = components["schemas"]["Slide"] & {
  rendered_html_preview?: string | null;
  rendered_previews?: RenderedPreviewFrame[];
};
type RenderedPreviewFrame = {
  image_url?: string | null;
  html_preview?: string | null;
  split_index: number;
  split_count: number;
};

type MarkdownTable = {
  headers: string[];
  rows: string[][];
  startLine: number;
  endLine: number;
};

type ChartDatum = {
  label: string;
  value: number;
};

function parseTableRow(line: string): string[] {
  const cells = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
  return cells;
}

function isSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("-")) return false;
  const normalized = trimmed
    .replace(/\|/g, "")
    .replace(/:/g, "")
    .replace(/\s/g, "");
  return normalized.length > 0 && /^-+$/.test(normalized);
}

function extractFirstMarkdownTable(markdown: string): MarkdownTable | null {
  const lines = markdown.split(/\r?\n/);

  for (let i = 0; i < lines.length - 1; i += 1) {
    const headerLine = lines[i];
    const separatorLine = lines[i + 1];
    if (!headerLine.includes("|") || !isSeparatorRow(separatorLine)) {
      continue;
    }

    const headers = parseTableRow(headerLine);
    if (headers.length < 2) continue;

    const rows: string[][] = [];
    let end = i + 1;
    for (let j = i + 2; j < lines.length; j += 1) {
      const rowLine = lines[j];
      if (!rowLine.includes("|") || !rowLine.trim()) {
        break;
      }
      rows.push(parseTableRow(rowLine));
      end = j;
    }

    if (rows.length === 0) continue;

    return {
      headers,
      rows,
      startLine: i,
      endLine: end,
    };
  }

  return null;
}

function toNumber(value: string): number | null {
  const cleaned = value.replace(/,/g, "").replace(/%/g, "").trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function buildChartData(table: MarkdownTable): ChartDatum[] {
  if (table.headers.length === 0 || table.rows.length === 0) return [];

  let numericColumn = -1;
  for (let col = 0; col < table.headers.length; col += 1) {
    const nums = table.rows.map((row) => toNumber(row[col] ?? ""));
    const valid = nums.filter((n) => n !== null);
    if (valid.length >= Math.max(2, Math.ceil(table.rows.length * 0.6))) {
      numericColumn = col;
      break;
    }
  }
  if (numericColumn < 0) return [];

  const labelColumn = numericColumn === 0 ? 1 : 0;

  return table.rows
    .map((row, idx) => {
      const value = toNumber(row[numericColumn] ?? "");
      if (value === null) return null;
      const labelRaw = row[labelColumn] ?? `Item ${idx + 1}`;
      return {
        label: labelRaw || `Item ${idx + 1}`,
        value,
      };
    })
    .filter((item): item is ChartDatum => Boolean(item))
    .slice(0, 8);
}

function stripTable(markdown: string, table: MarkdownTable | null): string {
  if (!table) return markdown;
  const lines = markdown.split(/\r?\n/);
  const before = lines.slice(0, table.startLine);
  const after = lines.slice(table.endLine + 1);
  return [...before, ...after].join("\n").trim();
}

function SlideChart({ data }: { data: ChartDatum[] }) {
  const maxValue = Math.max(...data.map((item) => item.value), 0);

  return (
    <div className="rounded-xl border bg-zinc-50 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
        Chart
      </p>
      <div className="flex h-48 items-end gap-2">
        {data.map((item) => {
          const heightPercent =
            maxValue > 0 ? (item.value / maxValue) * 100 : 0;
          return (
            <div
              key={`${item.label}-${item.value}`}
              className="flex flex-1 flex-col items-center gap-2"
            >
              <span className="text-[10px] text-zinc-500">{item.value}</span>
              <div className="flex h-32 w-full items-end rounded bg-zinc-100 p-1">
                <div
                  className="w-full rounded bg-primary/80"
                  style={{ height: `${Math.max(heightPercent, 6)}%` }}
                />
              </div>
              <span className="line-clamp-1 text-center text-[10px] text-zinc-600">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SlideCard({
  slide,
  isActive,
  onModify,
  isRegenerating = false,
  onOpenPreview,
}: {
  slide: Slide;
  isActive: boolean;
  onModify?: (slide: Slide) => void;
  isRegenerating?: boolean;
  onOpenPreview?: (slide: Slide) => void;
}) {
  const renderedPreviews = useMemo(() => {
    if (Array.isArray(slide.rendered_previews) && slide.rendered_previews.length) {
      return [...slide.rendered_previews].sort(
        (a, b) => (a.split_index ?? 0) - (b.split_index ?? 0)
      );
    }
    if (slide.thumbnail_url || slide.rendered_html_preview) {
      return [
        {
          image_url: slide.thumbnail_url,
          html_preview: slide.rendered_html_preview,
          split_index: 0,
          split_count: 1,
        },
      ];
    }
    return [];
  }, [slide.rendered_html_preview, slide.rendered_previews, slide.thumbnail_url]);
  const hasRenderedPreview = renderedPreviews.length > 0;
  const hasMultipleRenderedPreviews = renderedPreviews.length > 1;
  const table = useMemo(
    () => extractFirstMarkdownTable(slide.content || ""),
    [slide.content]
  );
  const chartData = useMemo(
    () => (table ? buildChartData(table) : []),
    [table]
  );
  const bodyMarkdown = useMemo(
    () => stripTable(slide.content || "", table),
    [slide.content, table]
  );
  const hasChart = chartData.length > 0;

  return (
    <div
      id={slide.id || `slide-${slide.index}`}
      data-index={slide.index}
      className={cn(
        "slide-card mb-10 w-full overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-300",
        hasMultipleRenderedPreviews
          ? "min-h-[420px]"
          : "min-h-[420px] md:aspect-[16/9]",
        isActive ? "ring-2 ring-primary/30 shadow-md" : "hover:shadow-md"
      )}
    >
      <div
        className={cn(
          "grid h-full gap-4",
          hasRenderedPreview
            ? "grid-rows-[1fr] p-3 md:p-4"
            : "grid-rows-[auto_1fr_auto] p-6 md:p-8"
        )}
      >
        {!hasRenderedPreview ? (
          <header>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Slide {slide.index + 1}
            </p>
            <h2 className="mt-1 text-2xl font-bold text-zinc-900 md:text-3xl">
              {slide.title || `Untitled slide ${slide.index + 1}`}
            </h2>
          </header>
        ) : null}

        <main
          className={cn(
            "grid min-h-0 gap-4",
            hasRenderedPreview
              ? "grid-cols-1"
              : hasChart
                ? "md:grid-cols-[1.25fr_1fr]"
                : "grid-cols-1"
          )}
        >
          {hasRenderedPreview ? (
            <div className="flex min-h-0 flex-col gap-3 overflow-auto">
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 shadow-sm">
                  Slide {slide.index + 1}
                </div>
                {hasMultipleRenderedPreviews ? (
                  <div className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                    已展开 {renderedPreviews.length} 页
                  </div>
                ) : null}
                {isActive && onModify ? (
                  <button
                    type="button"
                    onClick={() => onModify(slide)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium text-zinc-700 shadow-sm transition hover:bg-white hover:text-zinc-900"
                    disabled={isRegenerating}
                    title={`修改第 ${slide.index + 1} 页`}
                  >
                    {isRegenerating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Edit3 className="h-3.5 w-3.5" />
                    )}
                    <span>{isRegenerating ? "修改中..." : "修改当前页"}</span>
                  </button>
                ) : null}
              </div>
              {renderedPreviews.map((preview, previewIndex) => (
                <div
                  key={`${slide.id || slide.index}-preview-${preview.split_index ?? previewIndex}`}
                  className={cn(
                    "relative overflow-hidden rounded-xl border bg-zinc-100",
                    onOpenPreview ? "cursor-zoom-in" : ""
                  )}
                  onClick={() => onOpenPreview?.(slide)}
                >
                  {hasMultipleRenderedPreviews ? (
                    <div className="absolute left-3 top-3 z-10 rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 shadow-sm">
                      分页 {previewIndex + 1} / {renderedPreviews.length}
                    </div>
                  ) : null}
                  {preview.html_preview ? (
                    <HtmlPreviewFrame
                      title={
                        renderedPreviews.length > 1
                          ? `${slide.title || `Slide ${slide.index + 1}`} - 分页 ${previewIndex + 1}`
                          : slide.title || `Slide ${slide.index + 1}`
                      }
                      html={preview.html_preview}
                      className="min-h-[360px]"
                    />
                  ) : preview.image_url ? (
                    <img
                      src={preview.image_url ?? undefined}
                      alt={
                        renderedPreviews.length > 1
                          ? `${slide.title || `Slide ${slide.index + 1}`} - page ${previewIndex + 1}`
                          : slide.title || `Slide ${slide.index + 1}`
                      }
                      className="h-full w-full object-contain bg-white"
                      loading="lazy"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="min-h-0 overflow-auto rounded-xl border bg-white/80 p-4 prose prose-sm max-w-none text-zinc-700 prose-headings:text-zinc-900 prose-strong:text-zinc-900">
                {slide.content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {bodyMarkdown || slide.content}
                  </ReactMarkdown>
                ) : (
                  <div className="flex h-full items-center justify-center opacity-60">
                    <Loader2 className="h-7 w-7 animate-spin" />
                  </div>
                )}
              </div>

              {hasChart ? <SlideChart data={chartData} /> : null}
            </>
          )}
        </main>

        {!hasRenderedPreview && slide.sources && slide.sources.length > 0 ? (
          <footer className="flex flex-wrap gap-2 border-t pt-3">
            {slide.sources.map((source, idx) => (
              <span
                key={`${source.filename}-${idx}`}
                className="rounded-full border bg-zinc-50 px-2 py-1 text-[11px] text-zinc-600"
              >
                Source: {source.filename}
                {source.page_number ? ` (P${source.page_number})` : ""}
              </span>
            ))}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
