"use client";

import {
  type Announcements,
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type ScreenReaderInstructions,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  ListChecks,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
  type Control,
  Controller,
  type FieldErrors,
  type UseFormRegister,
  useFieldArray,
  useForm,
} from "react-hook-form";
import {
  type QuizAnswer,
  type QuizQuestion,
  type QuizRevisionContent,
  quizRevisionContentSchema,
} from "@/features/artifacts/quizzes/contract";
import { createQuizDeliverySnapshot } from "@/features/artifacts/quizzes/delivery";
import { QuizPlayerFrame } from "./QuizPlayerFrame";

const EDITOR_PREVIEW_ARTIFACT_ID = "00000000-0000-4000-8000-000000000001";
const EDITOR_PREVIEW_REVISION_ID = "00000000-0000-4000-8000-000000000002";

type IdIssuer = (count: number) => Promise<string[]>;

function SortableQuestionOutline({
  active,
  children,
  id,
  onSelect,
}: {
  active: boolean;
  children: React.ReactNode;
  id: string;
  onSelect: () => void;
}) {
  const t = useTranslations("Quiz");
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-stretch rounded-xl border transition-colors ${
        active
          ? "border-[var(--studio-border-strong)] bg-[var(--studio-surface-subtle)]"
          : "border-transparent hover:border-[var(--workspace-border)] hover:bg-[var(--workspace-surface)]"
      }`}
    >
      <button
        type="button"
        aria-label={t("dragQuestion")}
        {...attributes}
        {...listeners}
        className="cursor-grab px-2 text-[var(--workspace-text-muted)] opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] group-hover:opacity-100"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 px-1 py-3 pr-3 text-left">
        {children}
      </button>
    </div>
  );
}

function SortableOption({ children, id }: { children: React.ReactNode; id: string }) {
  const t = useTranslations("Quiz");
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2"
    >
      <button
        type="button"
        aria-label={t("dragOption")}
        {...attributes}
        {...listeners}
        className="cursor-grab rounded p-1 text-[var(--workspace-text-muted)]"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-medium text-[var(--workspace-text-muted)]">
      {children}
    </span>
  );
}

function ChoiceOptionsEditor({
  control,
  index,
  issueIds,
  register,
}: {
  control: Control<QuizRevisionContent>;
  index: number;
  issueIds: IdIssuer;
  register: UseFormRegister<QuizRevisionContent>;
}) {
  const t = useTranslations("Quiz");
  const { append, fields, move, remove } = useFieldArray({
    control,
    name: `questions.${index}.options`,
  });
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const itemLabel = (id: string | number) =>
    t("optionNumber", {
      number: Math.max(1, fields.findIndex((field) => field.id === id) + 1),
    });
  const announcements = {
    onDragCancel: ({ active }) => t("dragCancelled", { item: itemLabel(active.id) }),
    onDragEnd: ({ active, over }) =>
      over
        ? t("dragDropped", { item: itemLabel(active.id), target: itemLabel(over.id) })
        : t("dragCancelled", { item: itemLabel(active.id) }),
    onDragOver: ({ active, over }) =>
      over ? t("dragOver", { item: itemLabel(active.id), target: itemLabel(over.id) }) : undefined,
    onDragStart: ({ active }) => t("dragPickedUp", { item: itemLabel(active.id) }),
  } satisfies Announcements;
  const screenReaderInstructions = {
    draggable: t("dragInstructions"),
  } satisfies ScreenReaderInstructions;
  return (
    <DndContext
      accessibility={{ announcements, screenReaderInstructions }}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return;
        const from = fields.findIndex((field) => field.id === active.id);
        const to = fields.findIndex((field) => field.id === over.id);
        if (from >= 0 && to >= 0) move(from, to);
      }}
    >
      <SortableContext
        items={fields.map((field) => field.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {fields.map((field, optionIndex) => (
            <SortableOption id={field.id} key={field.id}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--workspace-surface-muted)] text-xs font-semibold text-[var(--workspace-text-muted)]">
                {String.fromCharCode(65 + optionIndex)}
              </span>
              <input
                {...register(`questions.${index}.options.${optionIndex}.text`)}
                className="min-w-0 flex-1 rounded-lg border border-[var(--workspace-border)] bg-transparent px-3 py-2 text-sm focus:border-[var(--studio-border-strong)] focus:outline-none"
              />
              <button
                type="button"
                aria-label={t("moveUpOption")}
                disabled={optionIndex === 0}
                onClick={() => move(optionIndex, optionIndex - 1)}
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={t("moveDownOption")}
                disabled={optionIndex === fields.length - 1}
                onClick={() => move(optionIndex, optionIndex + 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={t("deleteOption")}
                disabled={fields.length <= 2}
                onClick={() => remove(optionIndex)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </SortableOption>
          ))}
          <button
            type="button"
            disabled={fields.length >= 6}
            onClick={() =>
              void issueIds(1).then(
                ([optionId]) => optionId && append({ optionId, text: t("newOption") }),
              )
            }
            className="ml-10 flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[var(--studio-accent-text)] hover:bg-[var(--studio-surface-subtle)]"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("addOption")}
          </button>
        </div>
      </SortableContext>
    </DndContext>
  );
}

function firstInvalidQuestionIndex(errors: FieldErrors<QuizRevisionContent>) {
  if (!Array.isArray(errors.questions)) return null;
  const index = errors.questions.findIndex(Boolean);
  return index >= 0 ? index : null;
}

export function QuizEditor({
  content,
  issueIds,
  onCancel,
  onSave,
  saveError = false,
  saving,
}: {
  content: QuizRevisionContent;
  issueIds: IdIssuer;
  onCancel: () => void;
  onSave: (content: QuizRevisionContent) => void;
  saveError?: boolean;
  saving: boolean;
}) {
  const t = useTranslations("Quiz");
  const form = useForm<QuizRevisionContent>({
    defaultValues: content,
    mode: "onChange",
    resolver: zodResolver(quizRevisionContentSchema),
  });
  const [selectedQuestionId, setSelectedQuestionId] = useState(
    content.questions[0]?.questionId ?? "",
  );
  const [previewContent, setPreviewContent] = useState<QuizRevisionContent | null>(null);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [previewAnswers, setPreviewAnswers] = useState<Map<string, QuizAnswer>>(new Map());
  const [previewFlagged, setPreviewFlagged] = useState<Set<string>>(new Set());
  const previewSnapshot = useMemo(
    () =>
      previewContent
        ? createQuizDeliverySnapshot({
            artifactId: EDITOR_PREVIEW_ARTIFACT_ID,
            content: previewContent,
            revisionId: EDITOR_PREVIEW_REVISION_ID,
          })
        : null,
    [previewContent],
  );
  const { append, fields, move, remove } = useFieldArray({
    control: form.control,
    name: "questions",
  });
  const questions = form.watch("questions");
  const selectedIndex = Math.max(
    0,
    questions.findIndex((question) => question.questionId === selectedQuestionId),
  );
  const selectedQuestion = questions[selectedIndex];
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const itemLabel = (id: string | number) =>
    t("questionNumber", { number: Math.max(1, fields.findIndex((field) => field.id === id) + 1) });
  const announcements = {
    onDragCancel: ({ active }) => t("dragCancelled", { item: itemLabel(active.id) }),
    onDragEnd: ({ active, over }) =>
      over
        ? t("dragDropped", { item: itemLabel(active.id), target: itemLabel(over.id) })
        : t("dragCancelled", { item: itemLabel(active.id) }),
    onDragOver: ({ active, over }) =>
      over ? t("dragOver", { item: itemLabel(active.id), target: itemLabel(over.id) }) : undefined,
    onDragStart: ({ active }) => t("dragPickedUp", { item: itemLabel(active.id) }),
  } satisfies Announcements;
  const screenReaderInstructions = {
    draggable: t("dragInstructions"),
  } satisfies ScreenReaderInstructions;

  async function addQuestion(type: QuizQuestion["type"]) {
    const ids = await issueIds(type === "true_false" ? 1 : 3);
    const questionId = ids[0];
    if (!questionId) return;
    const base = {
      difficulty: "medium" as const,
      explanationMarkdown: t("newExplanation"),
      points: 1,
      promptMarkdown: t("newPrompt"),
      questionId,
    };
    if (type === "true_false") append({ ...base, correctAnswer: true, type });
    else {
      const first = ids[1];
      const second = ids[2];
      if (!first || !second) return;
      const options = [
        { optionId: first, text: t("optionA") },
        { optionId: second, text: t("optionB") },
      ];
      append(
        type === "single_choice"
          ? { ...base, correctOptionId: first, options, type }
          : { ...base, correctOptionIds: [first], options, type },
      );
    }
    setSelectedQuestionId(questionId);
  }

  async function duplicateQuestion(index: number) {
    const question = form.getValues(`questions.${index}`);
    const ids = await issueIds(question.type === "true_false" ? 1 : question.options.length + 1);
    const questionId = ids[0];
    if (!questionId) return;
    if (question.type === "true_false") append({ ...question, questionId });
    else {
      const options = question.options.map((option, optionIndex) => ({
        ...option,
        optionId: ids[optionIndex + 1] ?? option.optionId,
      }));
      if (question.type === "single_choice") {
        const oldIndex = question.options.findIndex(
          (option) => option.optionId === question.correctOptionId,
        );
        const correctOptionId = options[oldIndex]?.optionId;
        if (!correctOptionId) return;
        append({ ...question, correctOptionId, options, questionId });
      } else {
        const oldCorrect = new Set(question.correctOptionIds);
        append({
          ...question,
          correctOptionIds: options
            .filter((_, optionIndex) =>
              oldCorrect.has(question.options[optionIndex]?.optionId ?? ""),
            )
            .map((option) => option.optionId),
          options,
          questionId,
        });
      }
    }
    setSelectedQuestionId(questionId);
  }

  function showInvalid(errors: FieldErrors<QuizRevisionContent>) {
    const invalidIndex = firstInvalidQuestionIndex(errors);
    const invalidQuestion =
      invalidIndex === null ? null : form.getValues(`questions.${invalidIndex}`);
    if (invalidQuestion) setSelectedQuestionId(invalidQuestion.questionId);
  }

  if (previewSnapshot) {
    return (
      <div className="flex h-[calc(100dvh-10rem)] min-h-[600px] max-h-[860px] min-w-0 flex-col overflow-hidden bg-[var(--workspace-surface)]">
        <div className="flex min-h-12 items-center justify-between border-b border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)] px-4">
          <div>
            <span className="text-sm font-semibold">{t("draftPreview")}</span>
            <span className="ml-2 text-xs text-[var(--workspace-text-muted)]">
              {t("previewNoAttempt")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPreviewContent(null)}
            className="rounded-lg border border-[var(--workspace-border)] px-3 py-1.5 text-xs"
          >
            {t("backToEditor")}
          </button>
        </div>
        <QuizPlayerFrame
          answers={previewAnswers}
          className="min-h-0 max-h-none flex-1"
          finishLabel={t("finishPreview")}
          flagged={previewFlagged}
          onAnswer={(questionId, answer) =>
            setPreviewAnswers((current) => new Map(current).set(questionId, answer))
          }
          onFinish={() => setPreviewContent(null)}
          onPageIndexChange={setPreviewPageIndex}
          onToggleFlag={(questionId) =>
            setPreviewFlagged((current) => {
              const next = new Set(current);
              if (next.has(questionId)) next.delete(questionId);
              else next.add(questionId);
              return next;
            })
          }
          pageIndex={previewPageIndex}
          snapshot={previewSnapshot}
        />
      </div>
    );
  }

  const typeLabel = selectedQuestion
    ? selectedQuestion.type === "single_choice"
      ? t("singleChoice")
      : selectedQuestion.type === "multiple_choice"
        ? t("multipleChoice")
        : t("trueFalse")
    : "";

  return (
    <form
      onSubmit={form.handleSubmit(onSave, showInvalid)}
      className="flex h-[calc(100dvh-10rem)] min-h-[600px] max-h-[860px] min-w-0 flex-col overflow-hidden bg-[var(--workspace-surface)]"
    >
      <div className="grid shrink-0 grid-cols-[minmax(240px,1fr)_minmax(260px,1.4fr)_150px_150px] gap-3 border-b border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)]/45 px-5 py-4">
        <label>
          <FieldLabel>{t("editorTitle")}</FieldLabel>
          <input
            {...form.register("title")}
            aria-label={t("editorTitle")}
            className="h-9 w-full rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-surface)] px-3 text-sm font-semibold focus:border-[var(--studio-border-strong)] focus:outline-none"
          />
        </label>
        <label>
          <FieldLabel>{t("editorDescription")}</FieldLabel>
          <input
            {...form.register("descriptionMarkdown")}
            aria-label={t("editorDescription")}
            className="h-9 w-full rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-surface)] px-3 text-sm focus:border-[var(--studio-border-strong)] focus:outline-none"
          />
        </label>
        <label>
          <FieldLabel>{t("feedbackMode")}</FieldLabel>
          <select
            {...form.register("settings.feedbackMode")}
            aria-label={t("feedbackMode")}
            className="h-9 w-full rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-surface)] px-2 text-sm"
          >
            <option value="after_submission">{t("afterSubmissionFeedback")}</option>
            <option value="immediate">{t("immediateFeedback")}</option>
          </select>
        </label>
        <label>
          <FieldLabel>{t("navigationMode")}</FieldLabel>
          <select
            {...form.register("settings.navigationMode")}
            aria-label={t("navigationMode")}
            className="h-9 w-full rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-surface)] px-2 text-sm"
          >
            <option value="free">{t("freeNavigation")}</option>
            <option value="sequential">{t("sequentialNavigation")}</option>
          </select>
        </label>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[270px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)]/35">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-[var(--studio-accent-text)]" />
              <h3 className="text-sm font-semibold">{t("questionOutline")}</h3>
            </div>
            <span className="text-xs text-[var(--workspace-text-muted)]">
              {questions.length}/50
            </span>
          </div>
          <DndContext
            accessibility={{ announcements, screenReaderInstructions }}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={({ active, over }) => {
              if (!over || active.id === over.id) return;
              const from = fields.findIndex((field) => field.id === active.id);
              const to = fields.findIndex((field) => field.id === over.id);
              if (from >= 0 && to >= 0) move(from, to);
            }}
          >
            <SortableContext
              items={fields.map((field) => field.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
                {fields.map((field, index) => {
                  const question = questions[index];
                  if (!question) return null;
                  const shortType =
                    question.type === "single_choice"
                      ? t("singleChoiceShort")
                      : question.type === "multiple_choice"
                        ? t("multipleChoiceShort")
                        : t("trueFalseShort");
                  return (
                    <SortableQuestionOutline
                      active={question.questionId === selectedQuestionId}
                      id={field.id}
                      key={field.id}
                      onSelect={() => setSelectedQuestionId(question.questionId)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--workspace-surface)] text-[11px] font-semibold">
                          {index + 1}
                        </span>
                        <span className="truncate text-xs font-medium">
                          {question.promptMarkdown}
                        </span>
                      </div>
                      <div className="mt-1.5 flex gap-2 pl-8 text-[10px] text-[var(--workspace-text-muted)]">
                        <span>{shortType}</span>
                        <span>{t("surveyPoints", { points: question.points })}</span>
                      </div>
                    </SortableQuestionOutline>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
          <div className="grid grid-cols-3 gap-1 border-t border-[var(--workspace-border)] p-2">
            {(
              [
                ["single_choice", t("singleChoiceShort")],
                ["multiple_choice", t("multipleChoiceShort")],
                ["true_false", t("trueFalseShort")],
              ] as const
            ).map(([type, label]) => (
              <button
                key={type}
                type="button"
                disabled={fields.length >= 50}
                onClick={() => void addQuestion(type)}
                className="flex items-center justify-center gap-1 rounded-lg border border-[var(--workspace-border)] py-2 text-xs hover:border-[var(--studio-border-strong)]"
              >
                <Plus className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto px-6 py-5 2xl:px-10">
          {selectedQuestion ? (
            <div className="mx-auto max-w-[860px] space-y-6">
              <div className="flex items-center justify-between border-b border-[var(--workspace-border)] pb-4">
                <div>
                  <p className="text-xs font-medium text-[var(--studio-accent-text)]">
                    {t("questionHeading", { number: selectedIndex + 1, type: typeLabel })}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold">{t("editQuestion")}</h3>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={t("moveUpQuestion")}
                    disabled={selectedIndex === 0}
                    onClick={() => move(selectedIndex, selectedIndex - 1)}
                    className="rounded-lg p-2 hover:bg-[var(--workspace-surface-muted)]"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("moveDownQuestion")}
                    disabled={selectedIndex === fields.length - 1}
                    onClick={() => move(selectedIndex, selectedIndex + 1)}
                    className="rounded-lg p-2 hover:bg-[var(--workspace-surface-muted)]"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("copyQuestion")}
                    disabled={fields.length >= 50}
                    onClick={() => void duplicateQuestion(selectedIndex)}
                    className="rounded-lg p-2 hover:bg-[var(--workspace-surface-muted)]"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("deleteQuestion")}
                    disabled={fields.length <= 1}
                    onClick={() => {
                      const next = questions[selectedIndex + 1] ?? questions[selectedIndex - 1];
                      if (next) setSelectedQuestionId(next.questionId);
                      remove(selectedIndex);
                    }}
                    className="rounded-lg p-2 text-[var(--app-danger)] hover:bg-[var(--workspace-surface-muted)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <section>
                <FieldLabel>{t("questionPrompt", { number: selectedIndex + 1 })}</FieldLabel>
                <textarea
                  {...form.register(`questions.${selectedIndex}.promptMarkdown`)}
                  aria-label={t("questionPrompt", { number: selectedIndex + 1 })}
                  rows={4}
                  className="w-full resize-y rounded-xl border border-[var(--workspace-border)] bg-transparent px-4 py-3 text-base leading-7 focus:border-[var(--studio-border-strong)] focus:outline-none"
                />
              </section>

              {selectedQuestion.type === "true_false" ? null : (
                <section className="rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)]/25 p-4">
                  <FieldLabel>{t("answerOptions")}</FieldLabel>
                  <ChoiceOptionsEditor
                    control={form.control}
                    index={selectedIndex}
                    issueIds={issueIds}
                    register={form.register}
                  />
                </section>
              )}

              <section className="grid gap-4 rounded-xl border border-[var(--workspace-border)] p-4 md:grid-cols-[minmax(0,1fr)_160px_120px]">
                <div>
                  <FieldLabel>{t("answer")}</FieldLabel>
                  {selectedQuestion.type === "single_choice" ? (
                    <select
                      {...form.register(`questions.${selectedIndex}.correctOptionId`)}
                      aria-label={t("answer")}
                      className="h-10 w-full rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-surface)] px-3 text-sm"
                    >
                      {selectedQuestion.options.map((option) => (
                        <option key={option.optionId} value={option.optionId}>
                          {option.text}
                        </option>
                      ))}
                    </select>
                  ) : selectedQuestion.type === "multiple_choice" ? (
                    <div className="flex min-h-10 flex-wrap items-center gap-3">
                      {selectedQuestion.options.map((option, optionIndex) => (
                        <label
                          className="inline-flex items-center gap-1.5 text-sm"
                          key={option.optionId}
                        >
                          <input
                            type="checkbox"
                            aria-label={`${t("answer")} ${String.fromCharCode(65 + optionIndex)}`}
                            checked={selectedQuestion.correctOptionIds.includes(option.optionId)}
                            onChange={(event) => {
                              const current = form.getValues(`questions.${selectedIndex}`);
                              if (current.type !== "multiple_choice") return;
                              form.setValue(
                                `questions.${selectedIndex}.correctOptionIds`,
                                event.target.checked
                                  ? [...current.correctOptionIds, option.optionId]
                                  : current.correctOptionIds.filter((id) => id !== option.optionId),
                                { shouldDirty: true, shouldValidate: true },
                              );
                            }}
                          />
                          {String.fromCharCode(65 + optionIndex)}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <Controller
                      control={form.control}
                      name={`questions.${selectedIndex}.correctAnswer`}
                      render={({ field }) => (
                        <select
                          aria-label={t("answer")}
                          className="h-10 w-full rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-surface)] px-3 text-sm"
                          name={field.name}
                          onBlur={field.onBlur}
                          onChange={(event) => field.onChange(event.target.value === "true")}
                          ref={field.ref}
                          value={field.value ? "true" : "false"}
                        >
                          <option value="true">{t("true")}</option>
                          <option value="false">{t("false")}</option>
                        </select>
                      )}
                    />
                  )}
                </div>
                <label>
                  <FieldLabel>{t("difficulty")}</FieldLabel>
                  <select
                    {...form.register(`questions.${selectedIndex}.difficulty`)}
                    aria-label={t("difficulty")}
                    className="h-10 w-full rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-surface)] px-3 text-sm"
                  >
                    <option value="easy">{t("easy")}</option>
                    <option value="medium">{t("medium")}</option>
                    <option value="hard">{t("hard")}</option>
                  </select>
                </label>
                <label>
                  <FieldLabel>{t("points")}</FieldLabel>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    {...form.register(`questions.${selectedIndex}.points`, { valueAsNumber: true })}
                    aria-label={t("points")}
                    className="h-10 w-full rounded-lg border border-[var(--workspace-border)] bg-transparent px-3 text-sm"
                  />
                </label>
              </section>

              <section>
                <FieldLabel>{t("explanation")}</FieldLabel>
                <textarea
                  {...form.register(`questions.${selectedIndex}.explanationMarkdown`)}
                  aria-label={t("explanation")}
                  rows={4}
                  className="w-full resize-y rounded-xl border border-[var(--workspace-border)] bg-transparent px-4 py-3 text-sm leading-6 focus:border-[var(--studio-border-strong)] focus:outline-none"
                />
              </section>
            </div>
          ) : null}
        </main>
      </div>

      <footer className="flex min-h-16 shrink-0 items-center gap-3 border-t border-[var(--workspace-border)] bg-[var(--workspace-surface)] px-5">
        <Settings2 className="h-4 w-4 text-[var(--workspace-text-muted)]" />
        <div aria-live="polite" className="text-xs">
          {saveError ? (
            <span className="text-[var(--app-danger)]">{t("revisionSaveFailed")}</span>
          ) : saving ? (
            <span className="text-[var(--workspace-text-muted)]">{t("savingRevision")}</span>
          ) : form.formState.isDirty ? (
            <span className="text-amber-700 dark:text-amber-300">{t("unsavedChanges")}</span>
          ) : (
            <span className="text-[var(--workspace-text-muted)]">{t("noChanges")}</span>
          )}
          {Object.keys(form.formState.errors).length > 0 ? (
            <span role="alert" className="ml-3 text-[var(--app-danger)]">
              {t("invalidStructure")}
            </span>
          ) : null}
        </div>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() =>
            void form.handleSubmit((validContent) => {
              setPreviewPageIndex(0);
              setPreviewAnswers(new Map());
              setPreviewFlagged(new Set());
              setPreviewContent(validContent);
            }, showInvalid)()
          }
          className="rounded-lg border border-[var(--workspace-border)] px-4 py-2 text-sm"
        >
          {t("previewDraft")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--workspace-border)] px-4 py-2 text-sm"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={saving || !form.formState.isDirty}
          className="rounded-lg bg-[var(--app-primary)] px-4 py-2 text-sm text-[var(--app-on-primary)] disabled:opacity-45"
        >
          {saving ? t("savingRevision") : t("saveRevision")}
        </button>
      </footer>
    </form>
  );
}
