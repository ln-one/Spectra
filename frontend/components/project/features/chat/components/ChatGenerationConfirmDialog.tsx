"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProjectStore } from "@/stores/projectStore";
import type { ChatGenerationConfirmDraft } from "@/stores/project-store/types";

interface ChatGenerationConfirmDialogProps {
  projectId: string;
}

type DraftFormState = {
  summary: string;
  prompt: string;
  pageCount: string;
  visualStyle: string;
  layoutMode: "smart" | "classic";
};

function buildFormState(
  draft: ChatGenerationConfirmDraft | null | undefined
): DraftFormState {
  return {
    summary: draft?.summary ?? "",
    prompt: draft?.config.prompt ?? draft?.prompt ?? "",
    pageCount: String(draft?.config.pageCount ?? 8),
    visualStyle: draft?.config.visualStyle ?? "free",
    layoutMode: draft?.config.layoutMode ?? "smart",
  };
}

export function ChatGenerationConfirmDialog({
  projectId,
}: ChatGenerationConfirmDialogProps) {
  void projectId;
  const {
    activeSessionId,
    generationConfirmDraft,
    startPptFromChatDraft,
    setGenerationConfirmDraft,
  } = useProjectStore(
    useShallow((state) => {
      const activeSessionId = state.activeSessionId;
      return {
        activeSessionId,
        generationConfirmDraft: activeSessionId
          ? state.generationConfirmDraftBySession[activeSessionId] ?? null
          : null,
        startPptFromChatDraft: state.startPptFromChatDraft,
        setGenerationConfirmDraft: state.setGenerationConfirmDraft,
      };
    })
  );
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DraftFormState>(() =>
    buildFormState(generationConfirmDraft)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setForm(buildFormState(generationConfirmDraft));
    setOpen(Boolean(generationConfirmDraft && activeSessionId));
  }, [activeSessionId, generationConfirmDraft]);

  const canConfirm = useMemo(() => {
    return Boolean(activeSessionId && form.prompt.trim());
  }, [activeSessionId, form.prompt]);

  const closeDialog = () => {
    setOpen(false);
    if (activeSessionId) {
      setGenerationConfirmDraft(activeSessionId, null);
    }
  };

  const handleConfirm = async () => {
    if (!activeSessionId || !generationConfirmDraft || !canConfirm) {
      return;
    }
    setIsSubmitting(true);
    try {
      await startPptFromChatDraft(activeSessionId, {
        ...generationConfirmDraft,
        summary: form.summary.trim() || generationConfirmDraft.summary,
        prompt: form.prompt.trim() || generationConfirmDraft.prompt,
        config: {
          ...generationConfirmDraft.config,
          prompt: form.prompt.trim() || generationConfirmDraft.config.prompt,
          pageCount: Math.max(1, Number(form.pageCount) || 8),
          visualStyle: form.visualStyle.trim() || "free",
          layoutMode: form.layoutMode,
        },
      });
      closeDialog();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!activeSessionId || !generationConfirmDraft) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          closeDialog();
        }
      }}
    >
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-hidden rounded-3xl border-slate-200 bg-white p-0 text-slate-900 shadow-2xl">
        <div className="flex max-h-[88vh] flex-col">
          <DialogHeader className="border-b border-slate-100 px-8 py-6 text-left">
            <DialogTitle className="flex items-center gap-2 text-2xl font-semibold">
              <Sparkles className="h-5 w-5 text-indigo-600" />
              确认开始生成课件
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-500">
              系统已根据最近三轮对话和当前需求单整理好生成信息。确认后将直接创建当前会话的 PPT 生成任务。
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-8 py-6">
            <section className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                AI 汇总
              </Label>
              <Textarea
                value={form.summary}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    summary: event.target.value,
                  }))
                }
                className="min-h-[144px] resize-none rounded-2xl border-slate-200 text-base leading-7"
              />
            </section>

            <section className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                生成 Prompt
              </Label>
              <Textarea
                value={form.prompt}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    prompt: event.target.value,
                  }))
                }
                className="min-h-[128px] resize-none rounded-2xl border-slate-200 text-base leading-7"
              />
            </section>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">
                  页数
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={form.pageCount}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      pageCount: event.target.value,
                    }))
                  }
                  className="h-12 rounded-2xl border-slate-200 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">
                  风格
                </Label>
                <Input
                  value={form.visualStyle}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      visualStyle: event.target.value,
                    }))
                  }
                  className="h-12 rounded-2xl border-slate-200 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">
                  布局模式
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={form.layoutMode === "smart" ? "default" : "outline"}
                    className="h-12 rounded-2xl"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        layoutMode: "smart",
                      }))
                    }
                  >
                    智能
                  </Button>
                  <Button
                    type="button"
                    variant={form.layoutMode === "classic" ? "default" : "outline"}
                    className="h-12 rounded-2xl"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        layoutMode: "classic",
                      }))
                    }
                  >
                    模板
                  </Button>
                </div>
              </div>
            </section>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 px-8 py-5">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-2xl px-6"
              onClick={closeDialog}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button
              type="button"
              className="h-11 rounded-2xl px-6"
              onClick={() => void handleConfirm()}
              disabled={!canConfirm || isSubmitting}
            >
              {isSubmitting ? "正在创建任务..." : "确认"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
