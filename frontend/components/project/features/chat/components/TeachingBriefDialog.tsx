"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Sparkles } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useProjectStore } from "@/stores/projectStore";
import type {
  TeachingBrief,
  TeachingBriefProposal,
} from "@/stores/project-store/types";

type BriefFormState = {
  topic: string;
  audience: string;
  duration_minutes: string;
  lesson_hours: string;
  target_pages: string;
  teaching_objectives: string;
  knowledge_points: string;
  global_emphasis: string;
  global_difficulties: string;
  teaching_strategy: string;
  visual_tone: string;
  template_family: string;
  style_notes: string;
};

function toMultilineText(items: string[] | undefined): string {
  return Array.isArray(items) ? items.join("\n") : "";
}

function briefToFormState(brief?: TeachingBrief | null): BriefFormState {
  return {
    topic: brief?.topic ?? "",
    audience: brief?.audience ?? "",
    duration_minutes:
      brief?.duration_minutes != null ? String(brief.duration_minutes) : "",
    lesson_hours: brief?.lesson_hours != null ? String(brief.lesson_hours) : "",
    target_pages: brief?.target_pages != null ? String(brief.target_pages) : "",
    teaching_objectives: toMultilineText(brief?.teaching_objectives),
    knowledge_points: (brief?.knowledge_points ?? [])
      .map((item) => item.title)
      .filter(Boolean)
      .join("\n"),
    global_emphasis: toMultilineText(brief?.global_emphasis),
    global_difficulties: toMultilineText(brief?.global_difficulties),
    teaching_strategy: brief?.teaching_strategy ?? "",
    visual_tone: brief?.style_profile?.visual_tone ?? "",
    template_family: brief?.style_profile?.template_family ?? "",
    style_notes: brief?.style_profile?.notes ?? "",
  };
}

function formToPatch(form: BriefFormState): Record<string, unknown> {
  const splitLines = (value: string) =>
    value
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
  return {
    topic: form.topic.trim(),
    audience: form.audience.trim(),
    duration_minutes: form.duration_minutes.trim()
      ? Number(form.duration_minutes.trim())
      : null,
    lesson_hours: form.lesson_hours.trim()
      ? Number(form.lesson_hours.trim())
      : null,
    target_pages: form.target_pages.trim()
      ? Number(form.target_pages.trim())
      : null,
    teaching_objectives: splitLines(form.teaching_objectives),
    knowledge_points: splitLines(form.knowledge_points),
    global_emphasis: splitLines(form.global_emphasis),
    global_difficulties: splitLines(form.global_difficulties),
    teaching_strategy: form.teaching_strategy.trim(),
    style_profile: {
      visual_tone: form.visual_tone.trim(),
      template_family: form.template_family.trim(),
      notes: form.style_notes.trim(),
    },
  };
}

function summarizeProposalFields(proposal: TeachingBriefProposal): string {
  const fields = Object.keys(proposal.proposed_changes || {});
  if (fields.length === 0) return "未识别到结构化字段";
  return fields.join(" / ");
}

function getStatusLabel(status?: string): string {
  switch (status) {
    case "confirmed":
      return "已确认";
    case "review_pending":
      return "待确认";
    case "stale":
      return "待重新确认";
    default:
      return "草稿";
  }
}

export function TeachingBriefDialog() {
  const {
    activeSessionId,
    generationSession,
    updateTeachingBriefDraft,
    applyTeachingBriefProposal,
    dismissTeachingBriefProposal,
    confirmTeachingBrief,
    startPptFromTeachingBrief,
  } = useProjectStore(
    useShallow((state) => ({
      activeSessionId: state.activeSessionId,
      generationSession: state.generationSession,
      updateTeachingBriefDraft: state.updateTeachingBriefDraft,
      applyTeachingBriefProposal: state.applyTeachingBriefProposal,
      dismissTeachingBriefProposal: state.dismissTeachingBriefProposal,
      confirmTeachingBrief: state.confirmTeachingBrief,
      startPptFromTeachingBrief: state.startPptFromTeachingBrief,
    }))
  );
  const [open, setOpen] = useState(false);
  const brief = generationSession?.teaching_brief;
  const proposals = generationSession?.teaching_brief_proposals ?? [];
  const [form, setForm] = useState<BriefFormState>(() => briefToFormState(brief));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(briefToFormState(brief));
  }, [brief, open]);

  const missingFields = useMemo(
    () => brief?.readiness?.missing_fields ?? [],
    [brief?.readiness?.missing_fields]
  );

  const handleFieldChange = (key: keyof BriefFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!activeSessionId) return;
    setIsSaving(true);
    try {
      await updateTeachingBriefDraft(activeSessionId, formToPatch(form));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!activeSessionId) return;
    setIsSaving(true);
    try {
      await confirmTeachingBrief(activeSessionId, formToPatch(form));
    } finally {
      setIsSaving(false);
    }
  };

  const canGenerate = brief?.status === "confirmed" && brief?.readiness?.can_generate;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-full border-slate-200 bg-white px-3 text-[12px] text-slate-800"
          disabled={!activeSessionId}
        >
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          教学需求单
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden border-slate-200 bg-white p-0 text-slate-900">
        <DialogHeader className="border-b border-slate-200 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <Sparkles className="h-4 w-4 text-teal-700" />
            教学需求单
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            对话只提出候选更新；这里才是最终可编辑、可确认、可启动 PPT run 的需求界面。
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[calc(85vh-82px)] grid-cols-[1.3fr_0.9fr] overflow-hidden">
          <div className="overflow-y-auto px-6 py-5">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                状态：{getStatusLabel(brief?.status)}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                版本：{brief?.version ?? 1}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                可生成：{brief?.readiness?.can_generate ? "是" : "否"}
              </span>
            </div>

            {missingFields.length > 0 ? (
              <div className="mb-4 rounded-2xl border border-amber-400/40 bg-amber-50/80 px-4 py-3 text-xs text-amber-900">
                当前仍缺少：{missingFields.join(" / ")}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Input
                value={form.topic}
                onChange={(event) => handleFieldChange("topic", event.target.value)}
                placeholder="教学主题"
              />
              <Input
                value={form.audience}
                onChange={(event) =>
                  handleFieldChange("audience", event.target.value)
                }
                placeholder="受众，如高一学生/青年教师"
              />
              <Input
                value={form.duration_minutes}
                onChange={(event) =>
                  handleFieldChange("duration_minutes", event.target.value)
                }
                placeholder="分钟数"
              />
              <Input
                value={form.lesson_hours}
                onChange={(event) =>
                  handleFieldChange("lesson_hours", event.target.value)
                }
                placeholder="课时"
              />
              <Input
                value={form.target_pages}
                onChange={(event) =>
                  handleFieldChange("target_pages", event.target.value)
                }
                placeholder="目标页数"
              />
              <Input
                value={form.visual_tone}
                onChange={(event) =>
                  handleFieldChange("visual_tone", event.target.value)
                }
                placeholder="风格偏好"
              />
              <Input
                value={form.template_family}
                onChange={(event) =>
                  handleFieldChange("template_family", event.target.value)
                }
                placeholder="模板族"
              />
              <Input
                value={form.teaching_strategy}
                onChange={(event) =>
                  handleFieldChange("teaching_strategy", event.target.value)
                }
                placeholder="教学策略"
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <Textarea
                value={form.teaching_objectives}
                onChange={(event) =>
                  handleFieldChange("teaching_objectives", event.target.value)
                }
                placeholder="教学目标，一行一条"
                className="min-h-28"
              />
              <Textarea
                value={form.knowledge_points}
                onChange={(event) =>
                  handleFieldChange("knowledge_points", event.target.value)
                }
                placeholder="知识点，一行一条"
                className="min-h-28"
              />
              <Textarea
                value={form.global_emphasis}
                onChange={(event) =>
                  handleFieldChange("global_emphasis", event.target.value)
                }
                placeholder="重点，一行一条"
                className="min-h-24"
              />
              <Textarea
                value={form.global_difficulties}
                onChange={(event) =>
                  handleFieldChange("global_difficulties", event.target.value)
                }
                placeholder="难点，一行一条"
                className="min-h-24"
              />
            </div>

            <Textarea
              value={form.style_notes}
              onChange={(event) =>
                handleFieldChange("style_notes", event.target.value)
              }
              placeholder="额外风格说明"
              className="mt-3 min-h-24"
            />

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSave()}
                disabled={!activeSessionId || isSaving}
              >
                保存草稿
              </Button>
              <Button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={!activeSessionId || isSaving}
              >
                确认需求
              </Button>
              <Button
                type="button"
                variant={canGenerate ? "default" : "outline"}
                onClick={() => void startPptFromTeachingBrief(activeSessionId)}
                disabled={!activeSessionId || !canGenerate}
              >
                开始生成 PPT
              </Button>
            </div>
          </div>

          <div className="border-l border-slate-200 bg-slate-50/90 px-5 py-5">
            <div className="mb-3 text-sm font-semibold text-slate-900">
              对话候选更新
            </div>
            <div className="space-y-3 overflow-y-auto">
              {proposals.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-xs text-slate-500">
                  当前没有新的候选更新。继续对话时，系统会把可抽取字段放到这里等待确认。
                </div>
              ) : (
                proposals.map((proposal) => (
                  <div
                    key={proposal.proposal_id}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
                  >
                    <div className="text-xs font-medium text-slate-900">
                      字段：{summarizeProposalFields(proposal)}
                    </div>
                    {proposal.reasoning_summary ? (
                      <div className="mt-1 text-xs text-slate-500">
                        {proposal.reasoning_summary}
                      </div>
                    ) : null}
                    {proposal.confidence != null ? (
                      <div className="mt-1 text-[11px] text-slate-500">
                        置信度：{Math.round((proposal.confidence || 0) * 100)}%
                      </div>
                    ) : null}
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          activeSessionId
                            ? applyTeachingBriefProposal(
                                activeSessionId,
                                proposal.proposal_id
                              )
                            : Promise.resolve()
                        }
                      >
                        接受
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          activeSessionId
                            ? dismissTeachingBriefProposal(
                                activeSessionId,
                                proposal.proposal_id
                              )
                            : Promise.resolve()
                        }
                      >
                        忽略
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
