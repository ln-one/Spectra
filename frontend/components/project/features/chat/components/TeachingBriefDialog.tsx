"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { FileText, Sparkles, ChevronDown, ChevronUp, Info, Check, Save } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { TeachingBrief } from "@/stores/project-store/types";
import { useDebounce } from "@/hooks/use-debounce";

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
    },
  };
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
      return "整理中";
  }
}

function getStatusColor(status?: string): string {
  switch (status) {
    case "confirmed":
      return "text-green-700 bg-green-100 border-green-200";
    case "review_pending":
      return "text-amber-700 bg-amber-100 border-amber-200";
    case "stale":
      return "text-red-700 bg-red-100 border-red-200";
    default:
      return "text-slate-700 bg-slate-100 border-slate-200";
  }
}

const REQUIRED_FIELDS = ["topic", "audience", "target_pages"];

export function TeachingBriefDialog() {
  const {
    activeSessionId,
    generationSession,
    updateTeachingBriefDraft,
    confirmTeachingBrief,
    startPptFromTeachingBrief,
  } = useProjectStore(
    useShallow((state) => ({
      activeSessionId: state.activeSessionId,
      generationSession: state.generationSession,
      updateTeachingBriefDraft: state.updateTeachingBriefDraft,
      confirmTeachingBrief: state.confirmTeachingBrief,
      startPptFromTeachingBrief: state.startPptFromTeachingBrief,
    }))
  );
  const [open, setOpen] = useState(false);
  const brief = generationSession?.teaching_brief;
  const [form, setForm] = useState<BriefFormState>(() => briefToFormState(brief));
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Group collapse states
  const [basicOpen, setBasicOpen] = useState(true);
  const [designOpen, setDesignOpen] = useState(true);
  const [styleOpen, setStyleOpen] = useState(true);

  useEffect(() => {
    if (!open) return;
    setForm(briefToFormState(brief));
    setHasUnsavedChanges(false);
  }, [brief, open]);

  const missingFields = useMemo(
    () => brief?.readiness?.missing_fields ?? [],
    [brief?.readiness?.missing_fields]
  );

  const filledRequiredCount = REQUIRED_FIELDS.filter(f => form[f as keyof BriefFormState]?.trim()).length;
  const totalRequiredCount = REQUIRED_FIELDS.length;
  const progressPercent = Math.round((filledRequiredCount / totalRequiredCount) * 100);

  const debouncedForm = useDebounce(form, 1200);

  const performAutoSave = useCallback(async (currentForm: BriefFormState) => {
    if (!activeSessionId || !hasUnsavedChanges) return;
    setIsSaving(true);
    try {
      await updateTeachingBriefDraft(activeSessionId, formToPatch(currentForm));
      setHasUnsavedChanges(false);
    } catch (e) {
      console.error("Auto save failed", e);
    } finally {
      setIsSaving(false);
    }
  }, [activeSessionId, hasUnsavedChanges, updateTeachingBriefDraft]);

  useEffect(() => {
    if (open && hasUnsavedChanges) {
      void performAutoSave(debouncedForm);
    }
  }, [debouncedForm, open, hasUnsavedChanges, performAutoSave]);

  const handleFieldChange = (key: keyof BriefFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setHasUnsavedChanges(true);
  };

  const handleConfirm = async () => {
    if (!activeSessionId) return;
    setIsSaving(true);
    try {
      await confirmTeachingBrief(activeSessionId, formToPatch(form));
      setHasUnsavedChanges(false);
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
          className="h-8 rounded-full border-slate-200 bg-white px-3 text-[12px] text-slate-800 hover:bg-slate-50"
          disabled={!activeSessionId}
        >
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          需求单: {getStatusLabel(brief?.status)}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-hidden border-slate-200 bg-white p-0 text-slate-900 shadow-2xl rounded-3xl">
        <DialogHeader className="border-b border-slate-100 bg-slate-50/50 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                教学需求单
              </DialogTitle>
              <DialogDescription className="text-[11px] font-medium text-slate-500">
                这是 Spectra 根据对话自动整理的教学需求摘要，你可以随时手动修改；确认后才会作为生成依据。
              </DialogDescription>
            </div>
            
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-3">
                 <div className="relative h-14 w-14">
                   <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                     <circle
                       className="stroke-slate-200"
                       fill="none"
                       strokeWidth="2.5"
                       cx="18" cy="18" r="16"
                     />
                     <circle
                       className="stroke-indigo-500 transition-all duration-700 ease-out"
                       fill="none"
                       strokeWidth="2.5"
                       strokeDasharray={`${progressPercent}, 100`}
                       strokeLinecap="round"
                       cx="18" cy="18" r="16"
                     />
                   </svg>
                   <div className="absolute inset-0 flex flex-col items-center justify-center">
                     <span className="text-[12px] font-bold text-slate-800 leading-none">{progressPercent}%</span>
                     <span className="text-[7px] text-slate-400 font-bold uppercase mt-0.5">完成度</span>
                   </div>
                 </div>
                 <div className="flex flex-col items-end gap-1.5">
                   <span className={cn("text-[10px] px-2.5 py-0.5 rounded-full border font-bold uppercase tracking-widest", getStatusColor(brief?.status))}>
                     {getStatusLabel(brief?.status)}
                   </span>
                   <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold">
                     {isSaving ? (
                       <span className="flex items-center gap-1 text-indigo-500">
                         <Save className="h-2.5 w-2.5 animate-pulse" /> 正在同步
                       </span>
                     ) : hasUnsavedChanges ? (
                       <span className="flex items-center gap-1 text-amber-500">
                         <Save className="h-2.5 w-2.5" /> 待同步
                       </span>
                     ) : (
                       <span className="flex items-center gap-1 text-slate-400">
                         <Check className="h-2.5 w-2.5" /> 已同步
                       </span>
                     )}
                     <span className="bg-slate-100 px-1 rounded">V{brief?.version ?? 1}</span>
                   </div>
                 </div>
               </div>
            </div>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto px-8 py-8 scrollbar-hide">
          <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600">
            AI 自动识别内容，可人工覆盖。
          </div>

          {missingFields.length > 0 && (
            <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/50 px-5 py-4 text-xs text-amber-900 flex items-start gap-4">
              <div className="mt-0.5 rounded-full bg-amber-200 p-1.5 shrink-0">
                <Info className="w-3.5 h-3.5 text-amber-700" />
              </div>
              <div className="space-y-1.5">
                <p className="font-bold tracking-tight">建议完善以下信息：</p>
                <p className="text-amber-800/80 leading-relaxed font-medium">
                  {missingFields.map(f => `「${f}」`).join(" · ")}，补全后生成效果更佳。
                </p>
              </div>
            </div>
          )}

          {/* Group 1: Basic Info */}
          <section className="mb-8 space-y-5">
            <div 
              className="flex items-center justify-between cursor-pointer group"
              onClick={() => setBasicOpen(!basicOpen)}
            >
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2.5">
                <div className="h-2 w-2 rounded-full bg-indigo-500 shadow-sm" />
                核心背景
              </h3>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-300 group-hover:text-slate-400 transition-colors uppercase">
                {basicOpen ? "收起" : "展开"}
                {basicOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </div>
            </div>
            
            {basicOpen && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 pl-4.5 border-l-2 border-indigo-50 ml-1">
                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">教学主题 <span className="text-red-500">*</span></label>
                  <Input
                    value={form.topic}
                    onChange={(event) => handleFieldChange("topic", event.target.value)}
                    placeholder="例如：量子力学入门"
                    className={cn(
                      "h-11 rounded-xl border-slate-200 bg-slate-50/20 focus:bg-white focus:ring-indigo-100 transition-all",
                      !form.topic && missingFields.includes("topic") ? "border-amber-300 ring-2 ring-amber-100/50" : ""
                    )}
                  />
                </div>
                <div className="col-span-2 sm:col-span-1 space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">目标受众 <span className="text-red-500">*</span></label>
                  <Input
                    value={form.audience}
                    onChange={(event) => handleFieldChange("audience", event.target.value)}
                    placeholder="例如：大一理工科学生"
                    className={cn(
                      "h-11 rounded-xl border-slate-200 bg-slate-50/20 focus:bg-white focus:ring-indigo-100 transition-all",
                      !form.audience && missingFields.includes("audience") ? "border-amber-300 ring-2 ring-amber-100/50" : ""
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">预计课时</label>
                  <Input
                    type="number"
                    value={form.lesson_hours}
                    onChange={(event) => handleFieldChange("lesson_hours", event.target.value)}
                    placeholder="1"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50/20 focus:bg-white focus:ring-indigo-100 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">生成页数 <span className="text-red-500">*</span></label>
                  <Input
                    type="number"
                    value={form.target_pages}
                    onChange={(event) => handleFieldChange("target_pages", event.target.value)}
                    placeholder="20"
                    className={cn(
                      "h-11 rounded-xl border-slate-200 bg-slate-50/20 focus:bg-white focus:ring-indigo-100 transition-all",
                      !form.target_pages && missingFields.includes("target_pages") ? "border-amber-300 ring-2 ring-amber-100/50" : ""
                    )}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Group 2: Teaching Design */}
          <section className="mb-8 space-y-5">
            <div 
              className="flex items-center justify-between cursor-pointer group"
              onClick={() => setDesignOpen(!designOpen)}
            >
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2.5">
                <div className="h-2 w-2 rounded-full bg-teal-500 shadow-sm" />
                教学逻辑
              </h3>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-300 group-hover:text-slate-400 transition-colors uppercase">
                {designOpen ? "收起" : "展开"}
                {designOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </div>
            </div>
            
            {designOpen && (
              <div className="space-y-5 pl-4.5 border-l-2 border-teal-50 ml-1">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">教学目标</label>
                  <Textarea
                    value={form.teaching_objectives}
                    onChange={(event) => handleFieldChange("teaching_objectives", event.target.value)}
                    placeholder="本节课学生应掌握... (一行一条)"
                    className="min-h-[100px] rounded-xl border-slate-200 bg-slate-50/20 focus:bg-white focus:ring-teal-100 transition-all resize-none text-xs leading-relaxed"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">核心知识点</label>
                  <Textarea
                    value={form.knowledge_points}
                    onChange={(event) => handleFieldChange("knowledge_points", event.target.value)}
                    placeholder="课件必须包含的关键概念 (一行一条)"
                    className="min-h-[100px] rounded-xl border-slate-200 bg-slate-50/20 focus:bg-white focus:ring-teal-100 transition-all resize-none text-xs leading-relaxed"
                  />
                </div>
                <div className="grid grid-cols-2 gap-x-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">教学重点</label>
                    <Textarea
                      value={form.global_emphasis}
                      onChange={(event) => handleFieldChange("global_emphasis", event.target.value)}
                      placeholder="重点标注内容"
                      className="min-h-[70px] rounded-xl border-slate-200 bg-slate-50/20 focus:bg-white focus:ring-teal-100 transition-all resize-none text-xs leading-relaxed"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">教学难点</label>
                    <Textarea
                      value={form.global_difficulties}
                      onChange={(event) => handleFieldChange("global_difficulties", event.target.value)}
                      placeholder="需要深度讲解的内容"
                      className="min-h-[70px] rounded-xl border-slate-200 bg-slate-50/20 focus:bg-white focus:ring-teal-100 transition-all resize-none text-xs leading-relaxed"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">建议教学策略</label>
                  <Input
                    value={form.teaching_strategy}
                    onChange={(event) => handleFieldChange("teaching_strategy", event.target.value)}
                    placeholder="如：启发式教学、案例导向、PBL、小组讨论"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50/20 focus:bg-white focus:ring-teal-100 transition-all"
                  />
                </div>
              </div>
            )}
          </section>

          {/* Group 3: Style Preferences */}
          <section className="mb-2 space-y-5">
            <div 
              className="flex items-center justify-between cursor-pointer group"
              onClick={() => setStyleOpen(!styleOpen)}
            >
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2.5">
                <div className="h-2 w-2 rounded-full bg-purple-500 shadow-sm" />
                视觉风格
              </h3>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-300 group-hover:text-slate-400 transition-colors uppercase">
                {styleOpen ? "收起" : "展开"}
                {styleOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </div>
            </div>
            
            {styleOpen && (
              <div className="pl-4.5 border-l-2 border-purple-50 ml-1">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">视觉意向说明</label>
                  <Input
                    value={form.visual_tone}
                    onChange={(event) => handleFieldChange("visual_tone", event.target.value)}
                    placeholder="如：极简商务、清新校园、学术严谨、科技感、深色主题"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50/20 focus:bg-white focus:ring-purple-100 transition-all"
                  />
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-8 py-6">
          <div className="flex items-center gap-2 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
            <div className="h-1 w-1 rounded-full bg-red-400" />
            星号项为生成课件的最低要求
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              className="text-slate-500 hover:text-slate-800 text-xs font-bold transition-colors"
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              className={cn(
                "h-11 px-7 rounded-2xl font-bold transition-all shadow-sm active:scale-95",
                brief?.status !== "confirmed" 
                  ? "bg-slate-900 text-white hover:bg-slate-800" 
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              )}
              onClick={() => void handleConfirm()}
              disabled={!activeSessionId || isSaving || brief?.readiness?.can_generate === false}
            >
              {brief?.status === "confirmed" ? "重新确认" : "完成并确认"}
            </Button>
            <Button
              type="button"
              className={cn(
                "h-11 px-7 rounded-2xl font-bold transition-all shadow-lg active:scale-95",
                canGenerate 
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 border-0" 
                  : "bg-slate-200 text-slate-400"
              )}
              onClick={() => void startPptFromTeachingBrief(activeSessionId)}
              disabled={!activeSessionId || !canGenerate}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              立即生成课件
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
