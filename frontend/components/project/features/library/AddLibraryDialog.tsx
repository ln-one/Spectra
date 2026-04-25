"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Check, Library, RefreshCw, Search, Link2 } from "lucide-react";

export type SelectableLibrary = {
  id: string;
  name: string;
  description: string;
  visibility: "private" | "shared" | "unknown";
  isReferenceable: boolean;
};

interface AddLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  error: string | null;
  libraries: SelectableLibrary[];
  keyword: string;
  onKeywordChange: (value: string) => void;
  selectedLibraryId?: string | null;
  attachedLibraryIds?: string[];
  onSelectLibrary: (libraryId: string) => void;
  onReload: () => void;
}

function visibilityLabel(value: SelectableLibrary["visibility"]) {
  if (value === "shared") return "共享";
  if (value === "private") return "私有";
  return "未知";
}

function visibilityClass(value: SelectableLibrary["visibility"]) {
  if (value === "shared") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (value === "private") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-500";
}

export function AddLibraryDialog({
  open,
  onOpenChange,
  loading,
  error,
  libraries,
  keyword,
  onKeywordChange,
  selectedLibraryId,
  attachedLibraryIds = [],
  onSelectLibrary,
  onReload,
}: AddLibraryDialogProps) {
  const attachedSet = new Set(attachedLibraryIds);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.9),rgba(243,248,252,0.78))] p-0 shadow-[0_40px_110px_-54px_rgba(15,23,42,0.55)] backdrop-blur-3xl">
        <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-blue-300/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-2 h-36 w-36 rounded-full bg-purple-300/20 blur-3xl" />

        <DialogHeader className="relative border-b border-white/70 px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-2xl font-black tracking-tight text-zinc-900">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900 text-white">
              <Library className="h-4 w-4" />
            </span>
            导入资料库
          </DialogTitle>
          <p className="text-sm font-medium text-zinc-500">
            从下方选择一个可接入的资料库。
          </p>
        </DialogHeader>

        <div className="relative space-y-4 px-6 pb-6 pt-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                value={keyword}
                onChange={(event) => onKeywordChange(event.target.value)}
                placeholder="按名称或 ID 检索资料库"
                className="h-10 rounded-xl border-zinc-200/80 bg-white/80 pl-10"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onReload}
              className="h-10 w-10 rounded-xl border-zinc-200/80 bg-white/80"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}

          <ScrollArea className="h-[340px] rounded-2xl border border-zinc-200/80 bg-white/75 p-2 backdrop-blur-xl">
            <div className="divide-y divide-zinc-200/70 px-2">
              {!loading && libraries.length === 0 ? (
                <div className="py-8 text-center text-sm font-medium text-zinc-500">
                  没有匹配到资料库
                </div>
              ) : null}

              {libraries.map((library) => {
                const selected = selectedLibraryId?.trim() === library.id;
                const attached = attachedSet.has(library.id);
                const disabled = !library.isReferenceable || attached;

                return (
                  <article
                    key={library.id}
                    className="flex items-start justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <p
                        className="truncate text-sm font-bold text-zinc-900"
                        title={library.name}
                      >
                        {library.name}
                      </p>
                      <p
                        className="truncate text-xs text-zinc-500"
                        title={library.id}
                      >
                        {library.id}
                      </p>
                      {library.description ? (
                        <p
                          className="line-clamp-2 text-xs text-zinc-500"
                          title={library.description}
                        >
                          {library.description}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                            visibilityClass(library.visibility)
                          )}
                        >
                          {visibilityLabel(library.visibility)}
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                            library.isReferenceable
                              ? "border-blue-200 bg-blue-50 text-blue-700"
                              : "border-zinc-200 bg-zinc-50 text-zinc-500"
                          )}
                        >
                          {library.isReferenceable ? "可导入" : "不可导入"}
                        </span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      disabled={disabled}
                      onClick={() => onSelectLibrary(library.id)}
                      className="h-8 shrink-0 rounded-lg bg-zinc-900 px-3 text-xs font-bold hover:bg-zinc-800 disabled:bg-zinc-300"
                    >
                      {attached ? (
                        <>
                          <Check className="mr-1 h-3.5 w-3.5" />
                          已导入
                        </>
                      ) : selected ? (
                        <>
                          <Check className="mr-1 h-3.5 w-3.5" />
                          已选择
                        </>
                      ) : !library.isReferenceable ? (
                        <>
                          <Link2 className="mr-1 h-3.5 w-3.5" />
                          不可导入
                        </>
                      ) : (
                        "导入"
                      )}
                    </Button>
                  </article>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
