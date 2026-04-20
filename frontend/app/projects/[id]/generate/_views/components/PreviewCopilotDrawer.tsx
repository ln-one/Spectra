"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, Search, Wand2 } from "lucide-react";
import { ThinkingMark } from "@/components/icons/status/ThinkingMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { stripInlineCitationTags } from "@/lib/chat/citation-view-model";
import { chatApi } from "@/lib/sdk/chat";
import { previewApi } from "@/lib/sdk/preview";
import { cn } from "@/lib/utils";
import {
  parseDetailSections,
  toneClassName,
} from "@/components/project/features/outline-editor/utils";
import type {
  AuthorityPreviewSlide,
  PreviewPreambleLog,
} from "../useGeneratePreviewState";
import type { EditableSlideNode, EditableSlideScene } from "@/lib/sdk/preview";

type PreviewChatMessage = {
  id: string;
  role: string;
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown> | null;
};

type PexelsResult = {
  id: string;
  thumbnail_url: string;
  full_url: string;
  photographer: string;
  width: number;
  height: number;
};

type OutlineCard = {
  id: string;
  order: number;
  slideIndex: number;
  title: string;
  keyPoints: string[];
  estimatedMinutes?: number;
};

interface PreviewCopilotDrawerProps {
  projectId: string;
  sessionId: string | null;
  runId: string | null;
  artifactId: string | null;
  activeSlide: AuthorityPreviewSlide | null;
  activeScene: EditableSlideScene | null;
  selectedNodeId: string | null;
  preambleLogs: PreviewPreambleLog[];
  outline: Record<string, unknown> | null;
  onSelectSlide?: (slideIndex: number) => void;
  onSelectNode?: (nodeId: string | null) => void;
  onSceneUpdated?: (scene: EditableSlideScene) => void;
  onRefreshPreview?: () => void;
}

function filterPreviewMessages(
  messages: PreviewChatMessage[],
  runId: string | null
): PreviewChatMessage[] {
  return messages.filter((message) => {
    const channel = String(message.metadata?.channel || "").trim();
    if (channel !== "preview_copilot") return false;
    const messageRunId = String(message.metadata?.run_id || "").trim();
    if (!runId) return true;
    return !messageRunId || messageRunId === runId;
  });
}

function resolveRequestedSlideIndex(
  text: string,
  activeSlide: AuthorityPreviewSlide | null
): number | null {
  const explicit = text.match(/第\s*(\d+)\s*页/);
  if (explicit?.[1]) {
    const parsed = Number(explicit[1]);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return parsed - 1;
    }
  }
  if (/(当前页|这一页|本页)/.test(text) && activeSlide) {
    return activeSlide.index;
  }
  return activeSlide?.index ?? null;
}

function summarizeNode(node: EditableSlideNode): string {
  if (node.kind === "text") {
    return (node.text || node.label || "文本节点").slice(0, 36);
  }
  return node.alt || node.label || node.src || "图片节点";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      const record = asRecord(item);
      return normalizeText(record?.text || record?.title || record?.content);
    })
    .filter(Boolean);
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeOutlineCards(
  outline: Record<string, unknown> | null
): OutlineCard[] {
  if (!outline || typeof outline !== "object") return [];
  const nestedOutline = asRecord(outline.outline);
  const sessionOutline = asRecord(asRecord(outline.session)?.outline);
  const candidates = [outline, nestedOutline, sessionOutline].flatMap(
    (source) => (source ? [source.nodes, source.sections, source.slides] : [])
  );
  const rawItems = candidates.find((candidate) => Array.isArray(candidate));
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object"
    )
    .map((item, index) => {
      const order = normalizeNumber(item.order) ?? index + 1;
      const keyPointCandidates = [
        item.key_points,
        item.keyPoints,
        item.bullets,
        item.items,
        item.points,
      ];
      const keyPoints =
        keyPointCandidates
          .map(normalizeTextList)
          .find((points) => points.length > 0) ?? [];
      return {
        id: normalizeText(item.id) || `slide-${order}`,
        order,
        slideIndex: order > 0 ? order - 1 : index,
        title:
          normalizeText(item.title || item.heading) || `Slide ${index + 1}`,
        keyPoints,
        estimatedMinutes:
          normalizeNumber(item.estimated_minutes) ??
          normalizeNumber(item.estimatedMinutes) ??
          undefined,
      };
    })
    .sort((left, right) => left.order - right.order);
}

export function PreviewCopilotDrawer({
  projectId,
  sessionId,
  runId,
  artifactId,
  activeSlide,
  activeScene,
  selectedNodeId,
  preambleLogs,
  outline,
  onSelectSlide,
  onSelectNode,
  onSceneUpdated,
  onRefreshPreview,
}: PreviewCopilotDrawerProps) {
  const [expanded, setExpanded] = useState(true);
  const [messages, setMessages] = useState<PreviewChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingScene, setIsSavingScene] = useState(false);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [imageTargetNodeId, setImageTargetNodeId] = useState<string | null>(
    null
  );
  const [pexelsQuery, setPexelsQuery] = useState("");
  const [pexelsResults, setPexelsResults] = useState<PexelsResult[]>([]);
  const [isSearchingImages, setIsSearchingImages] = useState(false);

  const outlineCards = useMemo(() => normalizeOutlineCards(outline), [outline]);
  const textNodes = useMemo(
    () => activeScene?.nodes.filter((node) => node.kind === "text") ?? [],
    [activeScene?.nodes]
  );
  const imageNodes = useMemo(
    () => activeScene?.nodes.filter((node) => node.kind === "image") ?? [],
    [activeScene?.nodes]
  );
  const selectedNode = useMemo(
    () =>
      activeScene?.nodes.find((node) => node.node_id === selectedNodeId) ??
      null,
    [activeScene?.nodes, selectedNodeId]
  );
  const activeImageNode = useMemo(() => {
    if (!imageNodes.length) return null;
    const selectedImage =
      selectedNode?.kind === "image"
        ? (imageNodes.find((node) => node.node_id === selectedNode.node_id) ??
          null)
        : null;
    if (selectedImage) return selectedImage;
    if (imageTargetNodeId) {
      return (
        imageNodes.find((node) => node.node_id === imageTargetNodeId) ?? null
      );
    }
    return imageNodes[0] ?? null;
  }, [imageNodes, imageTargetNodeId, selectedNode]);

  useEffect(() => {
    if (!activeScene) {
      setDraftValues({});
      return;
    }
    setDraftValues((previous) => {
      const next: Record<string, string> = {};
      for (const node of activeScene.nodes) {
        next[node.node_id] =
          previous[node.node_id] ??
          (node.kind === "text" ? node.text || "" : node.src || "");
      }
      return next;
    });
  }, [activeScene]);

  useEffect(() => {
    if (!imageNodes.length) {
      setImageTargetNodeId(null);
      return;
    }
    if (selectedNode?.kind === "image") {
      setImageTargetNodeId(selectedNode.node_id);
      return;
    }
    setImageTargetNodeId((previous) =>
      previous && imageNodes.some((node) => node.node_id === previous)
        ? previous
        : (imageNodes[0]?.node_id ?? null)
    );
  }, [imageNodes, selectedNode]);

  useEffect(() => {
    setPexelsResults([]);
    setPexelsQuery("");
  }, [activeSlide?.slide_id, imageTargetNodeId]);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        setIsLoading(true);
        const response = await chatApi.getMessages({
          project_id: projectId,
          session_id: sessionId,
          limit: 100,
        });
        if (cancelled) return;
        setMessages(
          filterPreviewMessages(
            (response.data?.messages ?? []) as PreviewChatMessage[],
            runId
          )
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, runId, sessionId]);

  const dirtyOperations = useMemo(() => {
    if (!activeScene) return [];
    return activeScene.nodes
      .map((node) => {
        const original =
          node.kind === "text" ? node.text || "" : node.src || "";
        const draft = draftValues[node.node_id] ?? original;
        if (draft === original) return null;
        return {
          op: node.kind === "text" ? "replace_text" : "replace_image",
          node_id: node.node_id,
          value: draft,
        } as const;
      })
      .filter(Boolean) as Array<{
      op: "replace_text" | "replace_image";
      node_id: string;
      value: string;
    }>;
  }, [activeScene, draftValues]);

  const dirtyNodeIds = useMemo(
    () => new Set(dirtyOperations.map((item) => item.node_id)),
    [dirtyOperations]
  );
  const visibleMessages = useMemo(() => messages.slice(-12), [messages]);

  const submitChatMessage = async (content: string) => {
    if (!sessionId) return;
    const response = await chatApi.sendMessage({
      project_id: projectId,
      session_id: sessionId,
      content,
      metadata: {
        channel: "preview_copilot",
        run_id: runId,
        artifact_id: artifactId,
        slide_id: activeSlide?.slide_id,
        node_id: selectedNode?.node_id,
      },
    });
    setMessages((prev) =>
      filterPreviewMessages(
        [
          ...prev,
          {
            id: `local-user-${Date.now()}`,
            role: "user",
            content,
            metadata: { channel: "preview_copilot", run_id: runId },
          },
          (response.data?.message ?? null) as PreviewChatMessage,
        ].filter(Boolean) as PreviewChatMessage[],
        runId
      )
    );
  };

  const submitRedoRequest = async ({
    content,
    requestedSlideIndex,
  }: {
    content: string;
    requestedSlideIndex: number;
  }) => {
    if (!sessionId) return;
    await previewApi.modifySessionPreview(sessionId, {
      run_id: runId ?? undefined,
      artifact_id: artifactId ?? undefined,
      slide_index: requestedSlideIndex + 1,
      slide_id:
        requestedSlideIndex === activeSlide?.index
          ? activeSlide?.slide_id
          : undefined,
      instruction: content,
      scope: "current_slide_only",
      preserve_style: true,
      preserve_layout: true,
      preserve_deck_consistency: true,
      context: {
        channel: "preview_copilot",
        current_slide_id: activeSlide?.slide_id,
        selected_node_id: selectedNode?.node_id,
      },
    });
    await submitChatMessage(content);
    onRefreshPreview?.();
    setMessages((prev) => [
      ...prev,
      {
        id: `local-assistant-${Date.now()}`,
        role: "assistant",
        content: `已提交第 ${requestedSlideIndex + 1} 页重做请求，等待新预览返回。`,
        metadata: { channel: "preview_copilot", run_id: runId },
      },
    ]);
  };

  const handleRedoCurrentSlide = async () => {
    const trimmed = input.trim();
    const requestedSlideIndex = resolveRequestedSlideIndex(
      trimmed,
      activeSlide
    );
    if (!trimmed || requestedSlideIndex === null || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await submitRedoRequest({
        content: trimmed,
        requestedSlideIndex,
      });
      setInput("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveScene = async () => {
    if (!activeScene || !sessionId || isSavingScene) return;
    const sceneVersion = activeScene.scene_version?.trim();
    if (!sceneVersion || dirtyOperations.length === 0) return;
    try {
      setIsSavingScene(true);
      const response = await previewApi.saveSessionSlideScene(
        sessionId,
        activeScene.slide_id,
        {
          scene_version: sceneVersion,
          operations: dirtyOperations,
        },
        {
          artifact_id: artifactId ?? undefined,
          run_id: runId ?? undefined,
        }
      );
      onSceneUpdated?.(response.data.scene);
      onRefreshPreview?.();
      setMessages((prev) => [
        ...prev,
        {
          id: `local-assistant-scene-${Date.now()}`,
          role: "assistant",
          content: `已保存第 ${response.data.slide_no} 页的节点修改。`,
          metadata: { channel: "preview_copilot", run_id: runId },
        },
      ]);
    } finally {
      setIsSavingScene(false);
    }
  };

  const handleSearchImages = async () => {
    const query = pexelsQuery.trim();
    if (!query || isSearchingImages) return;
    try {
      setIsSearchingImages(true);
      const response = await previewApi.searchPexelsImages(query);
      setPexelsResults(response.data.results.slice(0, 4));
    } finally {
      setIsSearchingImages(false);
    }
  };

  const handleApplyImage = (nodeId: string, value: string) => {
    setDraftValues((previous) => ({
      ...previous,
      [nodeId]: value,
    }));
    setImageTargetNodeId(nodeId);
    onSelectNode?.(nodeId);
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="group absolute right-0 top-1/2 z-40 flex h-16 w-11 -translate-y-1/2 items-center justify-center rounded-l-2xl border border-r-0 border-black/10 bg-white/92 shadow-lg backdrop-blur-md transition-all hover:shadow-xl"
        title="展开 Preview Copilot"
      >
        <ThinkingMark className="h-6 w-6 text-blue-600 transition-transform group-hover:scale-110" />
      </button>
    );
  }

  return (
    <aside className="absolute right-4 top-4 bottom-4 z-40 flex w-[525px] flex-col overflow-hidden rounded-[28px] border border-black/5 bg-white/95 shadow-2xl backdrop-blur-xl">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-black/5 bg-white/60 px-5">
        <div className="min-w-0 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
            <ThinkingMark className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <div className="truncate text-base font-semibold text-[#1d1d1f]">
              智能助手
            </div>
            <div className="mt-1 text-xs leading-none text-black/45">
              前置信息、大纲、当前页节点与单页重做
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full text-black/40 hover:bg-black/5 hover:text-black/80"
          onClick={() => setExpanded(false)}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,#fafbff_0%,#f7f7f8_38%,#f5f5f6_100%)]">
        <div className="space-y-10 px-6 py-7">
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-5 w-1.5 rounded-full bg-blue-500" />
              <h3 className="text-base font-semibold text-[#1d1d1f]">
                前置过程记录
              </h3>
            </div>
            <div className="space-y-4">
              {preambleLogs.length === 0 ? (
                <div className="text-base italic text-black/40">
                  暂无可展示记录
                </div>
              ) : (
                preambleLogs.map((log) => {
                  const detailSections = log.detail
                    ? parseDetailSections(log.detail)
                    : [];
                  const isRequirementsCard = detailSections.length > 0;
                  const tone = log.tone as never;
                  return (
                    <div
                      key={log.id}
                      className="relative border-l border-black/10 pl-5"
                    >
                      <div className="absolute left-[-5px] top-2 h-2.5 w-2.5 rounded-full border-2 border-blue-500 bg-white" />
                      {!isRequirementsCard ? (
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-[15px] font-medium text-zinc-800",
                              toneClassName(tone)
                            )}
                          >
                            {log.title}
                          </span>
                        </div>
                      ) : null}
                      {isRequirementsCard ? (
                        <div className="mt-2.5 space-y-4 rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
                          {detailSections.map((section, sectionIndex) => (
                            <div
                              key={`${log.id}:${section.title}:${sectionIndex}`}
                              className="space-y-2.5"
                            >
                              <h4 className="text-[15px] font-semibold text-zinc-900">
                                {section.title}
                              </h4>
                              <div className="space-y-2 pl-1">
                                {section.lines.map((line, lineIndex) => (
                                  <p
                                    key={`${log.id}:${section.title}:${lineIndex}`}
                                    className="text-[14px] leading-relaxed text-zinc-600"
                                  >
                                    {line.replace(/^[-•]\s*/, "")}
                                  </p>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : log.detail ? (
                        <div className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-600">
                          {log.detail}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-5 w-1.5 rounded-full bg-indigo-500" />
              <h3 className="text-base font-semibold text-[#1d1d1f]">
                已确认大纲
              </h3>
            </div>
            <div className="space-y-3">
              {outlineCards.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-black/10 bg-white/70 px-4 py-5 text-base italic text-black/40">
                  暂无大纲内容
                </div>
              ) : (
                outlineCards.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => onSelectSlide?.(node.slideIndex)}
                    className="group flex w-full flex-col rounded-2xl border border-black/5 bg-white px-4 py-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-[11px] font-bold text-indigo-600 ring-1 ring-indigo-100">
                        {node.order}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="pt-0.5 text-[15px] font-semibold leading-snug text-[#1d1d1f]">
                          {node.title}
                        </div>
                        {node.estimatedMinutes ? (
                          <div className="mt-1 text-[11px] text-black/35">
                            预计 {node.estimatedMinutes} 分钟
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {node.keyPoints.length > 0 ? (
                      <div className="mt-3 space-y-1.5 pl-9">
                        {node.keyPoints.map((point, idx) => (
                          <div
                            key={idx}
                            className="flex gap-2 text-[13px] leading-snug text-zinc-500"
                          >
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-indigo-300" />
                            <span>{point}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-5 w-1.5 rounded-full bg-emerald-500" />
                <div>
                  <h3 className="text-base font-semibold text-[#1d1d1f]">
                    当前页节点编辑
                    {activeSlide ? ` (第${activeSlide.index + 1}页)` : ""}
                  </h3>
                  <div className="mt-1 text-xs text-black/45">
                    直接改文本，或为当前页图片搜索替换源图
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-9 shrink-0 gap-2 rounded-full border-black/10 px-4 text-sm hover:bg-black/5"
                onClick={() => void handleSaveScene()}
                disabled={isSavingScene || dirtyOperations.length === 0}
              >
                {isSavingScene ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                {dirtyOperations.length > 0
                  ? `保存 ${dirtyOperations.length} 项`
                  : "保存修改"}
              </Button>
            </div>

            {!activeScene ? (
              <div className="rounded-2xl border border-dashed border-black/10 bg-white/70 px-4 py-5 text-base italic text-black/40">
                当前页节点仍在解析中
              </div>
            ) : activeScene.nodes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-black/10 bg-white/70 px-4 py-5 text-base italic text-black/40">
                {activeScene.readonly_reason || "当前页暂不支持结构化编辑"}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-3">
                  {textNodes.map((node) => {
                    const value = draftValues[node.node_id] ?? node.text ?? "";
                    const isDirty = dirtyNodeIds.has(node.node_id);
                    return (
                      <div
                        key={node.node_id}
                        className={cn(
                          "rounded-2xl border bg-white p-4 shadow-sm transition",
                          isDirty
                            ? "border-emerald-300 shadow-emerald-100/60"
                            : "border-black/5"
                        )}
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/35">
                              文本节点
                            </div>
                            <div className="mt-1 truncate text-sm font-medium text-[#1d1d1f]">
                              {node.label}
                            </div>
                          </div>
                          <div className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] text-black/45">
                            {summarizeNode(node)}
                          </div>
                        </div>
                        <Textarea
                          value={value}
                          onFocus={() => onSelectNode?.(node.node_id)}
                          onChange={(event) =>
                            setDraftValues((previous) => ({
                              ...previous,
                              [node.node_id]: event.target.value,
                            }))
                          }
                          className="min-h-[118px] resize-y rounded-xl border-black/10 bg-white text-[14px] leading-relaxed text-zinc-700 shadow-sm focus-visible:ring-1 focus-visible:ring-emerald-500"
                        />
                      </div>
                    );
                  })}
                </div>
                {imageNodes.length > 0 ? (
                  <div className="space-y-4">
                    <div className="grid gap-3">
                      {imageNodes.map((node) => {
                        const draftSrc =
                          draftValues[node.node_id] ?? node.src ?? "";
                        const isActive =
                          activeImageNode?.node_id === node.node_id;
                        const isDirty = dirtyNodeIds.has(node.node_id);
                        return (
                          <button
                            key={node.node_id}
                            type="button"
                            onClick={() => {
                              setImageTargetNodeId(node.node_id);
                              onSelectNode?.(node.node_id);
                            }}
                            className={cn(
                              "grid w-full grid-cols-[120px,1fr] gap-4 rounded-2xl border bg-white p-4 text-left shadow-sm transition",
                              isActive
                                ? "border-emerald-400 shadow-emerald-100/70"
                                : "border-black/5 hover:border-black/10",
                              isDirty ? "ring-1 ring-emerald-200" : ""
                            )}
                          >
                            <div className="overflow-hidden rounded-xl bg-zinc-100">
                              {draftSrc ? (
                                <img
                                  src={draftSrc}
                                  alt={node.alt || node.label || "slide image"}
                                  className="h-[88px] w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-[88px] items-center justify-center text-xs text-black/35">
                                  暂无图片
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/35">
                                    图片节点
                                  </div>
                                  <div className="mt-1 truncate text-sm font-medium text-[#1d1d1f]">
                                    {node.label}
                                  </div>
                                </div>
                                <span
                                  className={cn(
                                    "rounded-full px-2.5 py-1 text-[11px]",
                                    isActive
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-black/5 text-black/45"
                                  )}
                                >
                                  {isActive ? "当前替换目标" : "点击设为目标"}
                                </span>
                              </div>
                              <Input
                                value={draftSrc}
                                onClick={(event) => event.stopPropagation()}
                                onFocus={() => onSelectNode?.(node.node_id)}
                                onChange={(event) =>
                                  handleApplyImage(
                                    node.node_id,
                                    event.target.value
                                  )
                                }
                                className="h-10 rounded-xl border-black/10 bg-white text-[13px]"
                              />
                              <div className="text-xs text-black/45">
                                {node.alt || "使用下方搜索结果可直接替换该图片"}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="rounded-[24px] border border-black/5 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/35">
                            搜索替换图片
                          </div>
                          <div className="mt-1 text-sm text-black/60">
                            当前目标：
                            {activeImageNode?.label || "未选择图片节点"}
                          </div>
                        </div>
                        {activeImageNode ? (
                          <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                            第 {activeSlide ? activeSlide.index + 1 : 0}{" "}
                            页图片替换
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 flex items-center gap-2">
                        <Input
                          value={pexelsQuery}
                          onChange={(event) =>
                            setPexelsQuery(event.target.value)
                          }
                          placeholder="搜索 Pexels 图片，例如：modern classroom"
                          className="h-11 rounded-xl border-black/10 bg-white text-[14px]"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-11 gap-2 rounded-xl border-black/10 px-4 text-sm"
                          onClick={() => void handleSearchImages()}
                          disabled={
                            isSearchingImages ||
                            !pexelsQuery.trim() ||
                            !activeImageNode
                          }
                        >
                          {isSearchingImages ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Search className="h-4 w-4" />
                          )}
                          搜索
                        </Button>
                      </div>

                      {pexelsResults.length > 0 ? (
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          {pexelsResults.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                if (!activeImageNode) return;
                                handleApplyImage(
                                  activeImageNode.node_id,
                                  item.full_url
                                );
                              }}
                              className="overflow-hidden rounded-2xl border border-black/10 bg-white text-left transition hover:border-emerald-400 hover:shadow-md"
                            >
                              <img
                                src={item.thumbnail_url}
                                alt={item.photographer || "Pexels image"}
                                className="h-28 w-full object-cover"
                              />
                              <div className="space-y-1 px-3 py-2.5">
                                <div className="truncate text-xs font-medium text-[#1d1d1f]">
                                  {item.photographer || "Pexels"}
                                </div>
                                <div className="text-[11px] text-black/45">
                                  {item.width} × {item.height}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : activeImageNode ? (
                        <div className="mt-4 rounded-2xl border border-dashed border-black/10 bg-zinc-50 px-4 py-4 text-sm text-black/40">
                          输入关键词后搜索，最多显示 4 张待选图片。
                        </div>
                      ) : (
                        <div className="mt-4 rounded-2xl border border-dashed border-black/10 bg-zinc-50 px-4 py-4 text-sm text-black/40">
                          先选择一个图片节点作为替换目标。
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
                {textNodes.length === 0 && imageNodes.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-black/10 bg-white/70 px-4 py-5 text-base italic text-black/40">
                    当前页未解析出可编辑节点
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-5 w-1.5 rounded-full bg-orange-500" />
              <h3 className="text-base font-semibold text-[#1d1d1f]">
                助手记录
              </h3>
            </div>
            <div className="space-y-3">
              {isLoading ? (
                <div className="flex items-center gap-2 text-[14px] text-black/40">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载中...
                </div>
              ) : visibleMessages.length === 0 ? (
                <div className="rounded-2xl border border-orange-100/50 bg-orange-50/50 p-4 text-[14px] leading-relaxed text-black/40">
                  下方输入框只提交当前页重做请求；普通上下文请先在主会话补充。
                </div>
              ) : (
                visibleMessages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex w-full",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[88%] rounded-[20px] px-4 py-3 text-[14px] leading-relaxed",
                        message.role === "user"
                          ? "rounded-tr-sm bg-black text-white"
                          : "rounded-tl-sm border border-black/5 bg-white text-zinc-800 shadow-sm"
                      )}
                    >
                      {stripInlineCitationTags(message.content)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      <div className="shrink-0 border-t border-black/5 bg-white px-5 py-4">
        <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-sm">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              activeSlide
                ? `输入提示词，重做第 ${activeSlide.index + 1} 页`
                : "输入提示词，重做当前页"
            }
            className="min-h-[82px] resize-none border-0 bg-transparent p-0 text-[15px] leading-relaxed text-zinc-800 shadow-none placeholder:text-black/35 focus-visible:ring-0"
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void handleRedoCurrentSlide();
              }
            }}
          />
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/5 pt-3">
            <div className="text-xs text-black/35">
              Ctrl/Command + Enter 提交单页重做
            </div>
            <Button
              size="sm"
              onClick={() => void handleRedoCurrentSlide()}
              disabled={
                !sessionId || !input.trim() || isSubmitting || !activeSlide
              }
              className="h-9 rounded-full bg-[#1d1d1f] px-4 text-sm font-medium text-white transition hover:bg-black/80 disabled:bg-black/10 disabled:text-black/35"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "重做当前页"
              )}
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
