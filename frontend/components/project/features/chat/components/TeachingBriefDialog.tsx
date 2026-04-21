"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FileText, PencilLine, Save } from "lucide-react";
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
    target_pages:
      brief?.target_pages != null ? String(brief.target_pages) : "8",
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

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <Label className="text-sm font-medium text-slate-700">{label}</Label>
      {children}
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
    "h-14 rounded-2xl border-slate-200 bg-white text-base leading-7";
  const textareaClassName =
    "min-h-[132px] rounded-2xl border-slate-200 bg-white text-base leading-7 resize-none";

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
          <DialogHeader className="border-b border-slate-100 px-8 py-6 text-left">
            <DialogTitle className="text-2xl font-semibold text-slate-900">
              教学需求单
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-500">
              后台会根据当前会话自动整理并覆写这里的内容。你也可以手动进入编辑模式修改并保存。
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
            {missingFields.length > 0 ? (
              <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900">
                当前仍建议补充：{missingFields.join("、")}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Field label="教学主题">
                <Input
                  value={form.topic}
                  onChange={(event) =>
                    handleFieldChange("topic", event.target.value)
                  }
                  readOnly={!isEditing}
                  className={inputClassName}
                />
              </Field>
              <Field label="目标受众">
                <Input
                  value={form.audience}
                  onChange={(event) =>
                    handleFieldChange("audience", event.target.value)
                  }
                  readOnly={!isEditing}
                  className={inputClassName}
                />
              </Field>
              <Field label="预计时长（分钟）">
                <Input
                  type="number"
                  value={form.duration_minutes}
                  onChange={(event) =>
                    handleFieldChange("duration_minutes", event.target.value)
                  }
                  readOnly={!isEditing}
                  className={inputClassName}
                />
              </Field>
              <Field label="预计课时">
                <Input
                  type="number"
                  value={form.lesson_hours}
                  onChange={(event) =>
                    handleFieldChange("lesson_hours", event.target.value)
                  }
                  readOnly={!isEditing}
                  className={inputClassName}
                />
              </Field>
              <Field label="生成页数">
                <Input
                  type="number"
                  value={form.target_pages}
                  onChange={(event) =>
                    handleFieldChange("target_pages", event.target.value)
                  }
                  readOnly={!isEditing}
                  className={inputClassName}
                />
              </Field>
              <Field label="视觉意向">
                <Input
                  value={form.visual_tone}
                  onChange={(event) =>
                    handleFieldChange("visual_tone", event.target.value)
                  }
                  readOnly={!isEditing}
                  className={inputClassName}
                />
              </Field>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6">
              <Field label="教学目标">
                <Textarea
                  value={form.teaching_objectives}
                  onChange={(event) =>
                    handleFieldChange("teaching_objectives", event.target.value)
                  }
                  readOnly={!isEditing}
                  className={textareaClassName}
                />
              </Field>
              <Field label="核心知识点">
                <Textarea
                  value={form.knowledge_points}
                  onChange={(event) =>
                    handleFieldChange("knowledge_points", event.target.value)
                  }
                  readOnly={!isEditing}
                  className={textareaClassName}
                />
              </Field>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Field label="教学重点">
                  <Textarea
                    value={form.global_emphasis}
                    onChange={(event) =>
                      handleFieldChange("global_emphasis", event.target.value)
                    }
                    readOnly={!isEditing}
                    className={textareaClassName}
                  />
                </Field>
                <Field label="教学难点">
                  <Textarea
                    value={form.global_difficulties}
                    onChange={(event) =>
                      handleFieldChange("global_difficulties", event.target.value)
                    }
                    readOnly={!isEditing}
                    className={textareaClassName}
                  />
                </Field>
              </div>
              <Field label="教学策略">
                <Textarea
                  value={form.teaching_strategy}
                  onChange={(event) =>
                    handleFieldChange("teaching_strategy", event.target.value)
                  }
                  readOnly={!isEditing}
                  className={textareaClassName}
                />
              </Field>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 px-8 py-5">
            {!isEditing ? (
              <Button
                type="button"
                className="h-11 rounded-2xl px-6"
                onClick={() => setIsEditing(true)}
              >
                <PencilLine className="mr-2 h-4 w-4" />
                编辑
              </Button>
            ) : (
              <Button
                type="button"
                className="h-11 rounded-2xl px-6"
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
