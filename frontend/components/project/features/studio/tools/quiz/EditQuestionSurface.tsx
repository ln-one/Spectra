"use client";

import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const editQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().trim().min(1, "题干不能为空。"),
  options: z
    .array(z.string())
    .refine(
      (values) => values.map((item) => item.trim()).filter(Boolean).length >= 2,
      "至少保留两个非空选项。"
    ),
  answer: z.string().trim().min(1, "请填写正确答案。"),
  explanation: z.string(),
});

export type EditQuestionFormValues = z.infer<typeof editQuestionSchema>;

interface EditQuestionSurfaceProps {
  question: EditQuestionFormValues;
  currentIndex: number;
  totalQuestions: number;
  isSaving: boolean;
  saveError: string | null;
  onDirtyChange: (isDirty: boolean) => void;
  onSave: (values: EditQuestionFormValues) => Promise<void> | void;
  onPreviousQuestion: (values: EditQuestionFormValues) => Promise<void> | void;
  onNextQuestion: (values: EditQuestionFormValues) => Promise<void> | void;
}

function normalizeFormValues(
  values: EditQuestionFormValues
): EditQuestionFormValues {
  return {
    id: values.id,
    question: values.question.trim(),
    options: values.options.map((item) => item.trim()),
    answer: values.answer.trim(),
    explanation: values.explanation.trim(),
  };
}

export function EditQuestionSurface({
  question,
  currentIndex,
  totalQuestions,
  isSaving,
  saveError,
  onDirtyChange,
  onSave,
  onPreviousQuestion,
  onNextQuestion,
}: EditQuestionSurfaceProps) {
  const questionKey = `${question.id}::${question.question}::${question.answer}::${question.explanation}::${question.options.join("||")}`;
  const form = useForm<EditQuestionFormValues>({
    resolver: zodResolver(editQuestionSchema),
    defaultValues: question,
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "options" as const,
  });

  useEffect(() => {
    form.reset(question);
  }, [form, questionKey]);

  useEffect(() => {
    onDirtyChange(form.formState.isDirty);
  }, [form.formState.isDirty, onDirtyChange]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <div className="mx-auto max-w-3xl">
            <Form {...form}>
              <form
                className="space-y-5"
                onSubmit={form.handleSubmit(async (values) => {
                  await onSave(normalizeFormValues(values));
                })}
              >
                {saveError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {saveError}
                  </div>
                ) : null}

                <FormField
                  control={form.control}
                  name="question"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-zinc-800">
                        题干
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          className="min-h-[140px] resize-none rounded-3xl border border-zinc-200 bg-white px-4 py-4 text-sm leading-7 focus-visible:border-violet-300 focus-visible:ring-[3px] focus-visible:ring-violet-100"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-800">选项</p>
                      <p className="text-[11px] text-zinc-500">
                        可以直接修改当前题的选项内容。
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 border-violet-200 px-3 text-[11px] text-violet-700 hover:bg-violet-50"
                      onClick={() => append("")}
                    >
                      添加选项
                    </Button>
                  </div>
                  {fields.map((fieldItem, index) => (
                    <FormField
                      key={fieldItem.id}
                      control={form.control}
                      name={`options.${index}`}
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-start gap-3">
                            <span className="mt-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-50 text-xs font-semibold text-violet-700">
                              {String.fromCharCode(65 + index)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <FormControl>
                                <Input
                                  {...field}
                                  className="h-11 rounded-2xl border-zinc-200 bg-white text-sm focus-visible:ring-violet-100"
                                  placeholder={`选项 ${String.fromCharCode(65 + index)}`}
                                />
                              </FormControl>
                            </div>
                            {fields.length > 2 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-9 px-2 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                                onClick={() => remove(index)}
                              >
                                删除
                              </Button>
                            ) : null}
                          </div>
                        </FormItem>
                      )}
                    />
                  ))}
                  {form.formState.errors.options?.message ? (
                    <p className="text-sm font-medium text-destructive">
                      {String(form.formState.errors.options.message)}
                    </p>
                  ) : null}
                </div>

                <FormField
                  control={form.control}
                  name="answer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-zinc-800">
                        正确答案
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          className="h-11 rounded-2xl border-zinc-200 bg-white text-sm focus-visible:ring-violet-100"
                          placeholder="填写正确答案内容"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="explanation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-zinc-800">
                        解析
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          className="min-h-[160px] resize-none rounded-3xl border border-zinc-200 bg-white px-4 py-4 text-sm leading-7 focus-visible:border-violet-300 focus-visible:ring-[3px] focus-visible:ring-violet-100"
                          placeholder="补充当前题的解析、易错点或课堂提示"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </div>
        </div>

        <div className="border-t border-violet-100 bg-zinc-50/70 px-4 py-3">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 border-zinc-200 px-3 text-xs"
                onClick={form.handleSubmit(async (values) => {
                  await onPreviousQuestion(normalizeFormValues(values));
                })}
                disabled={isSaving || currentIndex === 0}
              >
                上一题
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 border-zinc-200 px-3 text-xs"
                onClick={form.handleSubmit(async (values) => {
                  await onNextQuestion(normalizeFormValues(values));
                })}
                disabled={isSaving || currentIndex >= totalQuestions - 1}
              >
                下一题
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-9 bg-violet-600 px-4 text-xs text-white hover:bg-violet-700"
              onClick={form.handleSubmit(async (values) => {
                await onSave(normalizeFormValues(values));
              })}
              disabled={isSaving}
            >
              {isSaving ? "保存中" : "保存"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
