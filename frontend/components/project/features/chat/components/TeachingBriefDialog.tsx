"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BookOpenText,
  Clock3,
  FileText,
  GraduationCap,
  LibraryBig,
  Palette,
  PencilLine,
  Save,
  Sparkles,
  Target,
} from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/stores/projectStore";
import type { TeachingBrief } from "@/stores/project-store/types";

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
    target_pages: brief?.target_pages != null ? String(brief.target_pages) : "8",
    teaching_objectives: toMultilineText(brief?.teaching_objectives),
    knowledge_points: (brief?.knowledge_points ?? [])
      .map((item) => item.title)
      .filter(Boolean)
      .join("\n"),
    global_emphasis: toMultilineText(brief?.global_emphasis),
    global_difficulties: toMultilineText(brief?.global_difficulties),
    teaching_strategy: brief?.teaching_strategy ?? "",
    visual_tone: brief?.style_profile?.visual_tone ?? "",
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
    target_pages: form.target_pages.trim() ? Number(form.target_pages.trim()) : 8,
    teaching_objectives: splitLines(form.teaching_objectives),
    knowledge_points: splitLines(form.knowledge_points),
    global_emphasis: splitLines(form.global_emphasis),
    global_difficulties: splitLines(form.global_difficulties),
    teaching_strategy: form.teaching_strategy.trim(),
    style_profile: {
      visual_tone: form.visual_tone.trim(),
    },
  };
}

function SectionField({
  label,
  icon: Icon,
  tone = "slate",
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "indigo" | "teal" | "violet" | "amber" | "slate";
  children: ReactNode;
}) {
  const toneClassName =
    tone === "indigo"
      ? "border-indigo-100 bg-indigo-50/55"
      : tone === "teal"
        ? "border-teal-100 bg-teal-50/55"
        : tone === "violet"
          ? "border-violet-100 bg-violet-50/55"
          : tone === "amber"
            ? "border-amber-100 bg-amber-50/65"
            : "border-slate-200 bg-slate-50/70";

  return (
    <div className={cn("rounded-[22px] border p-4 shadow-sm", toneClassName)}>
      <div className="mb-3 flex items-center gap-2">
        {Icon ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-white/95 text-slate-700 shadow-sm">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
        <Label className="text-sm font-semibold tracking-[0.02em] text-slate-700">
          {label}
        </Label>
      </div>
      {children}
    </div>
  );
}

function InfoChip({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "indigo" | "teal" | "amber" | "violet";
}) {
  const iconToneClassName =
    tone === "indigo"
      ? "border-indigo-100 bg-indigo-50 text-indigo-700"
      : tone === "teal"
        ? "border-teal-100 bg-teal-50 text-teal-700"
        : tone === "amber"
          ? "border-amber-100 bg-amber-50 text-amber-700"
          : "border-violet-100 bg-violet-50 text-violet-700";

  return (
    <div className="rounded-[20px] border border-slate-200 bg-slate-50/75 px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <div
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-2xl border bg-white",
            iconToneClassName
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs font-semibold tracking-[0.06em] text-slate-500">
          {label}
        </span>
      </div>
      <div className="line-clamp-2 text-sm font-semibold leading-6 text-slate-800">
        {value}
      </div>
    </div>
  );
}

export function TeachingBriefDialog() {
  const { activeSessionId, generationSession, updateTeachingBriefDraft } =
    useProjectStore(
      useShallow((state) => ({
        activeSessionId: state.activeSessionId,
        generationSession: state.generationSession,
        updateTeachingBriefDraft: state.updateTeachingBriefDraft,
      }))
    );
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const brief = generationSession?.teaching_brief;
  const [form, setForm] = useState<BriefFormState>(() => briefToFormState(brief));

  useEffect(() => {
    if (!open) {
      setIsEditing(false);
      return;
    }
    setForm(briefToFormState(brief));
  }, [brief, open]);

  const missingFields = useMemo(
    () => brief?.readiness?.missing_fields ?? [],
    [brief?.readiness?.missing_fields]
  );

  const handleFieldChange = (key: keyof BriefFormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    if (!activeSessionId) {
      return;
    }
    setIsSaving(true);
    try {
      await updateTeachingBriefDraft(activeSessionId, formToPatch(form));
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const inputClassName =
    "h-14 rounded-2xl border-slate-200 bg-white text-base leading-7 shadow-sm";
  const textareaClassName =
    "min-h-[132px] rounded-2xl border-slate-200 bg-white text-base leading-7 shadow-sm resize-none";
  const facts = [
    {
      label: "主题",
      value: form.topic.trim() || "未填写",
      icon: BookOpenText,
      tone: "indigo" as const,
    },
    {
      label: "受众",
      value: form.audience.trim() || "未填写",
      icon: GraduationCap,
      tone: "teal" as const,
    },
    {
      label: "课时",
      value: form.lesson_hours.trim() || "未填写",
      icon: Clock3,
      tone: "amber" as const,
    },
    {
      label: "页数",
      value: form.target_pages.trim() || "8",
      icon: FileText,
      tone: "violet" as const,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 rounded-full border-slate-200 bg-white px-4 text-sm text-slate-800 hover:bg-slate-50"
          disabled={!activeSessionId}
        >
          <FileText className="mr-2 h-4 w-4" />
          需求单
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden rounded-3xl border-slate-200 bg-white p-0 text-slate-900 shadow-2xl">
        <div className="flex max-h-[92vh] flex-col">
          <DialogHeader className="border-b border-slate-100 bg-[linear-gradient(135deg,rgba(238,242,255,0.92),rgba(250,245,255,0.88),rgba(255,255,255,0.98))] px-8 py-7 text-left">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-semibold tracking-[0.08em] text-slate-600 shadow-sm">
                  <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                  SESSION BRIEF
                </div>
                <DialogTitle className="text-[30px] font-semibold leading-tight text-slate-900">
                  教学需求单
                </DialogTitle>
                <DialogDescription className="max-w-3xl text-sm leading-7 text-slate-600">
                  后台会根据当前会话自动整理并覆写这里的内容。你可以在这里审阅关键信息，再按需要进入编辑模式手动修正并保存。
                </DialogDescription>
              </div>
              <div className="rounded-[24px] border border-white/80 bg-white/80 px-4 py-3 text-right shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Brief Version
                </div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  V{brief?.version ?? 1}
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,#fafbff_0%,#ffffff_18%)] px-8 py-6">
            <div className="mb-6 rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.28)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Target className="h-4 w-4 text-indigo-600" />
                    当前提炼概览
                  </div>
                  <p className="text-sm leading-7 text-slate-600">
                    这份需求单会作为会话内的教学上下文资产持续更新。默认生成页数为 8 页，除非你在这里手动改写。
                  </p>
                </div>
                <div className="grid min-w-[280px] flex-1 grid-cols-2 gap-3">
                  {facts.map((fact) => (
                    <InfoChip
                      key={fact.label}
                      label={fact.label}
                      value={fact.value}
                      icon={fact.icon}
                      tone={fact.tone}
                    />
                  ))}
                </div>
              </div>
            </div>

            {missingFields.length > 0 ? (
              <div className="mb-6 rounded-[24px] border border-amber-200 bg-[linear-gradient(135deg,rgba(255,247,237,0.95),rgba(255,251,235,0.92))] px-5 py-4 shadow-sm">
                <div className="mb-1 text-sm font-semibold text-amber-900">
                  仍建议补充的信息
                </div>
                <div className="text-sm leading-7 text-amber-800">
                  {missingFields.join("、")}
                </div>
              </div>
            ) : null}

            <div className="space-y-7">
              <section className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-[0_14px_36px_-28px_rgba(15,23,42,0.25)]">
                <div className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
                  <BookOpenText className="h-4.5 w-4.5 text-indigo-600" />
                  核心背景
                </div>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <SectionField label="教学主题" icon={BookOpenText} tone="indigo">
                    <Input
                      value={form.topic}
                      onChange={(event) =>
                        handleFieldChange("topic", event.target.value)
                      }
                      readOnly={!isEditing}
                      className={cn(inputClassName, "border-indigo-100 bg-white/95")}
                    />
                  </SectionField>
                  <SectionField label="目标受众" icon={GraduationCap} tone="teal">
                    <Input
                      value={form.audience}
                      onChange={(event) =>
                        handleFieldChange("audience", event.target.value)
                      }
                      readOnly={!isEditing}
                      className={cn(inputClassName, "border-teal-100 bg-white/95")}
                    />
                  </SectionField>
                  <SectionField label="预计时长（分钟）" icon={Clock3} tone="amber">
                    <Input
                      type="number"
                      value={form.duration_minutes}
                      onChange={(event) =>
                        handleFieldChange("duration_minutes", event.target.value)
                      }
                      readOnly={!isEditing}
                      className={cn(inputClassName, "border-amber-100 bg-white/95")}
                    />
                  </SectionField>
                  <SectionField label="预计课时" icon={Clock3} tone="amber">
                    <Input
                      type="number"
                      value={form.lesson_hours}
                      onChange={(event) =>
                        handleFieldChange("lesson_hours", event.target.value)
                      }
                      readOnly={!isEditing}
                      className={cn(inputClassName, "border-amber-100 bg-white/95")}
                    />
                  </SectionField>
                  <SectionField label="生成页数" icon={FileText} tone="violet">
                    <Input
                      type="number"
                      value={form.target_pages}
                      onChange={(event) =>
                        handleFieldChange("target_pages", event.target.value)
                      }
                      readOnly={!isEditing}
                      className={cn(inputClassName, "border-violet-100 bg-white/95")}
                    />
                  </SectionField>
                  <SectionField label="视觉意向" icon={Palette} tone="violet">
                    <Input
                      value={form.visual_tone}
                      onChange={(event) =>
                        handleFieldChange("visual_tone", event.target.value)
                      }
                      readOnly={!isEditing}
                      className={cn(inputClassName, "border-violet-100 bg-white/95")}
                    />
                  </SectionField>
                </div>
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-[0_14px_36px_-28px_rgba(15,23,42,0.25)]">
                <div className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
                  <LibraryBig className="h-4.5 w-4.5 text-teal-600" />
                  教学逻辑
                </div>
                <div className="grid grid-cols-1 gap-5">
                  <SectionField label="教学目标" icon={Target} tone="teal">
                    <Textarea
                      value={form.teaching_objectives}
                      onChange={(event) =>
                        handleFieldChange("teaching_objectives", event.target.value)
                      }
                      readOnly={!isEditing}
                      className={cn(
                        textareaClassName,
                        "border-teal-100 bg-white/95"
                      )}
                    />
                  </SectionField>
                  <SectionField label="核心知识点" icon={LibraryBig} tone="indigo">
                    <Textarea
                      value={form.knowledge_points}
                      onChange={(event) =>
                        handleFieldChange("knowledge_points", event.target.value)
                      }
                      readOnly={!isEditing}
                      className={cn(
                        textareaClassName,
                        "border-indigo-100 bg-white/95"
                      )}
                    />
                  </SectionField>
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <SectionField label="教学重点" icon={Sparkles} tone="amber">
                      <Textarea
                        value={form.global_emphasis}
                        onChange={(event) =>
                          handleFieldChange("global_emphasis", event.target.value)
                        }
                        readOnly={!isEditing}
                        className={cn(
                          textareaClassName,
                          "border-amber-100 bg-white/95"
                        )}
                      />
                    </SectionField>
                    <SectionField label="教学难点" icon={Target} tone="amber">
                      <Textarea
                        value={form.global_difficulties}
                        onChange={(event) =>
                          handleFieldChange("global_difficulties", event.target.value)
                        }
                        readOnly={!isEditing}
                        className={cn(
                          textareaClassName,
                          "border-amber-100 bg-white/95"
                        )}
                      />
                    </SectionField>
                  </div>
                  <SectionField label="教学策略" icon={LibraryBig} tone="teal">
                    <Textarea
                      value={form.teaching_strategy}
                      onChange={(event) =>
                        handleFieldChange("teaching_strategy", event.target.value)
                      }
                      readOnly={!isEditing}
                      className={cn(
                        textareaClassName,
                        "border-teal-100 bg-white/95"
                      )}
                    />
                  </SectionField>
                </div>
              </section>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-8 py-5">
            <div className="text-sm leading-6 text-slate-500">
              {isEditing
                ? "编辑完成后保存，后台后续仍会继续基于当前会话自动更新。"
                : "当前为查看模式，可切换到编辑后手动修正内容。"}
            </div>
            {!isEditing ? (
              <Button
                type="button"
                className="h-11 rounded-2xl px-6 shadow-sm"
                onClick={() => setIsEditing(true)}
              >
                <PencilLine className="mr-2 h-4 w-4" />
                编辑
              </Button>
            ) : (
              <Button
                type="button"
                className="h-11 rounded-2xl px-6 shadow-sm"
                onClick={() => void handleSave()}
                disabled={isSaving}
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "保存中..." : "确认编辑并保存"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
