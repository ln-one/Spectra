"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import type {
  AuthorityEditableNode,
  AuthorityEditableScene,
} from "./EditableAuthorityHtmlStage";

type PreviewChatMessage = {
  id: string;
  role: string;
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown> | null;
};

interface PreviewCopilotDrawerProps {
  projectId: string;
  sessionId: string | null;
  runId: string | null;
  artifactId: string | null;
  activeSlide: AuthorityPreviewSlide | null;
  activeScene: AuthorityEditableScene | null;
  selectedNodeId: string | null;
  preambleLogs: PreviewPreambleLog[];
  outline: Record<string, unknown> | null;
  onSelectSlide?: (slideIndex: number) => void;
  onSelectNode?: (nodeId: string | null) => void;
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

function summarizeNode(node: AuthorityEditableNode): string {
  if (node.kind === "text") {
    return (node.text || "文本节点").slice(0, 36);
  }
  return node.alt || node.src || "图片节点";
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
}: PreviewCopilotDrawerProps) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<PreviewChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nodeDraft, setNodeDraft] = useState("");

  const selectedNode = useMemo(
    () => activeScene?.nodes.find((node) => node.node_id === selectedNodeId) ?? null,
    [activeScene?.nodes, selectedNodeId]
  );

  useEffect(() => {
    if (!selectedNode) {
      setNodeDraft("");
      return;
    }
    setNodeDraft(selectedNode.kind === "text" ? selectedNode.text || "" : selectedNode.src || "");
  }, [selectedNode]);

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

  const outlineNodes = useMemo(() => {
    if (!outline || typeof outline !== "object" || !Array.isArray(outline.nodes)) {
      return [];
    }
    return outline.nodes
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((item, index) => ({
        index,
        title: String(item.title || `Slide ${index + 1}`).trim(),
        bullets: (
          Array.isArray(item.key_points)
            ? item.key_points
            : Array.isArray(item.bullets)
              ? item.bullets
              : []
        )
          .map((bullet) => String(bullet).trim())
          .filter(Boolean),
      }));
  }, [outline]);

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

  const submitModifyRequest = async ({
    content,
    requestedSlideIndex,
    patch,
  }: {
    content: string;
    requestedSlideIndex: number;
    patch?: Record<string, unknown>;
  }) => {
    if (!sessionId) return;
    await previewApi.modifySessionPreview(sessionId, {
      run_id: runId ?? undefined,
      artifact_id: artifactId ?? undefined,
      slide_index: requestedSlideIndex + 1,
      slide_id:
        requestedSlideIndex === activeSlide?.index ? activeSlide?.slide_id : undefined,
      instruction: content,
      scope: "current_slide_only",
      preserve_style: true,
      preserve_layout: true,
      preserve_deck_consistency: true,
      patch: patch as never,
      context: {
        channel: "preview_copilot",
        current_slide_id: activeSlide?.slide_id,
        selected_node_id: selectedNode?.node_id,
      },
    });
    await submitChatMessage(content);
    setMessages((prev) => [
      ...prev,
      {
        id: `local-assistant-${Date.now()}`,
        role: "assistant",
        content: `已提交第 ${requestedSlideIndex + 1} 页修改请求，等待新预览返回。`,
        metadata: { channel: "preview_copilot", run_id: runId },
      },
    ]);
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !sessionId || isSubmitting) return;
    try {
      setIsSubmitting(true);
      const requestedSlideIndex = resolveRequestedSlideIndex(trimmed, activeSlide);
      if (/(重做|重写|重生成|改写|改成|修改)/.test(trimmed) && requestedSlideIndex !== null) {
        await submitModifyRequest({
          content: trimmed,
          requestedSlideIndex,
        });
      } else {
        await submitChatMessage(trimmed);
      }
      setInput("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyNodeEdit = async () => {
    if (!selectedNode || !activeSlide || !sessionId || isSubmitting) return;
    const nextValue = nodeDraft.trim();
    if (!nextValue) return;
    const content =
      selectedNode.kind === "text"
        ? `请修改第 ${activeSlide.index + 1} 页的文本节点，保持布局和样式不变，仅将内容改为：${nextValue}`
        : `请修改第 ${activeSlide.index + 1} 页的图片节点，保持布局和样式不变，替换图片资源为：${nextValue}`;
    const patch = {
      schema_version: 2,
      operations: [
        {
          op: selectedNode.kind === "text" ? "replace_text" : "replace_image",
          path: `/slides/${activeSlide.index}/nodes/${encodeURIComponent(selectedNode.node_id)}`,
          value:
            selectedNode.kind === "text"
              ? { node_id: selectedNode.node_id, text: nextValue }
              : { node_id: selectedNode.node_id, src: nextValue },
          note: "preview_copilot_node_edit",
        },
      ],
    };
    try {
      setIsSubmitting(true);
      await submitModifyRequest({
        content,
        requestedSlideIndex: activeSlide.index,
        patch,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="absolute right-0 top-1/2 z-40 flex h-14 w-10 -translate-y-1/2 items-center justify-center rounded-l-xl border border-r-0 border-black/10 bg-white/90 shadow-lg backdrop-blur-md transition-all hover:shadow-xl group"
        title="展开 Preview Copilot"
      >
        <Sparkles className="h-5 w-5 text-blue-600 transition-transform group-hover:scale-110" />
      </button>
    );
  }

  return (
    <aside className="absolute right-4 top-4 bottom-4 z-40 flex w-[420px] flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/95 shadow-2xl backdrop-blur-xl">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-black/5 bg-white/50 px-4">
        <div className="min-w-0 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50">
            <Sparkles className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <div className="truncate text-sm font-semibold text-[#1d1d1f]">
              智能助手
            </div>
            <div className="mt-0.5 text-[10px] leading-none text-black/45">
              预览上下文、节点编辑与单页重做
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full text-black/40 hover:bg-black/5 hover:text-black/80"
          onClick={() => setExpanded(false)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafafa]">
        <div className="space-y-8 px-5 py-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-4 w-1 rounded-full bg-blue-500" />
              <h3 className="text-sm font-semibold text-[#1d1d1f]">前置过程记录</h3>
            </div>
            <div className="space-y-4">
              {preambleLogs.length === 0 ? (
                <div className="text-sm italic text-black/40">暂无可展示记录</div>
              ) : (
                preambleLogs.map((log) => {
                  const detailSections = log.detail ? parseDetailSections(log.detail) : [];
                  const isRequirementsCard = detailSections.length > 0;
                  const tone = log.tone as never;
                  return (
                    <div key={log.id} className="relative border-l border-black/10 pl-4">
                      <div className="absolute left-[-4.5px] top-1.5 h-2 w-2 rounded-full border-2 border-blue-500 bg-white" />
                      {!isRequirementsCard ? (
                        <div className="flex items-center gap-2">
                          <span className={cn("text-[13px] font-medium text-zinc-800", toneClassName(tone))}>
                            {log.title}
                          </span>
                        </div>
                      ) : null}
                      {isRequirementsCard ? (
                        <div className="mt-2 space-y-4 rounded-xl border border-black/5 bg-white p-3 shadow-sm">
                          {detailSections.map((section, sectionIndex) => (
                            <div key={`${log.id}:${section.title}:${sectionIndex}`} className="space-y-2">
                              <h4 className="text-[13px] font-semibold text-zinc-900">
                                {section.title}
                              </h4>
                              <div className="space-y-1.5 pl-1">
                                {section.lines.map((line, lineIndex) => (
                                  <p
                                    key={`${log.id}:${section.title}:${lineIndex}`}
                                    className="text-[12px] leading-relaxed text-zinc-600"
                                  >
                                    {line.replace(/^[-•]\s*/, "")}
                                  </p>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : log.detail ? (
                        <div className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-600">
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
            <div className="flex items-center gap-2">
              <div className="h-4 w-1 rounded-full bg-indigo-500" />
              <h3 className="text-sm font-semibold text-[#1d1d1f]">已确认大纲</h3>
            </div>
            <div className="space-y-3">
              {outlineNodes.length === 0 ? (
                <div className="text-sm italic text-black/40">暂无大纲内容</div>
              ) : (
                outlineNodes.map((node) => (
                  <button
                    key={`${node.index}-${node.title}`}
                    type="button"
                    onClick={() => onSelectSlide?.(node.index)}
                    className="group flex w-full flex-col rounded-xl border border-black/5 bg-white p-3 text-left shadow-sm transition hover:border-black/10 hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-indigo-50 text-[10px] font-bold text-indigo-600">
                        {node.index + 1}
                      </span>
                      <span className="pt-0.5 text-[13px] font-medium leading-snug text-[#1d1d1f]">
                        {node.title}
                      </span>
                    </div>
                    {node.bullets.length > 0 ? (
                      <div className="mt-2.5 space-y-1 pl-8">
                        {node.bullets.map((bullet, idx) => (
                          <div key={idx} className="text-[12px] leading-snug text-zinc-500">
                            {bullet}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1 rounded-full bg-emerald-500" />
                <h3 className="text-sm font-semibold text-[#1d1d1f]">
                  当前页节点编辑{activeSlide ? ` (第${activeSlide.index + 1}页)` : ""}
                </h3>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 border-black/10 px-2 text-xs hover:bg-black/5"
                onClick={() => void handleApplyNodeEdit()}
                disabled={isSubmitting || !selectedNode}
              >
                {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                应用
              </Button>
            </div>
            {!activeScene || activeScene.nodes.length === 0 ? (
              <div className="text-sm italic text-black/40">当前页节点仍在解析中</div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {activeScene.nodes.slice(0, 16).map((node) => (
                    <button
                      key={node.node_id}
                      type="button"
                      onClick={() => onSelectNode?.(node.node_id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] transition",
                        node.node_id === selectedNodeId
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-black/10 bg-white text-black/60 hover:border-black/20"
                      )}
                    >
                      {node.kind === "text" ? "Text" : "Image"} · {summarizeNode(node)}
                    </button>
                  ))}
                </div>
                {selectedNode ? (
                  <div className="space-y-2 rounded-xl border border-black/5 bg-white p-3 shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-black/35">
                      {selectedNode.kind === "text" ? "文本节点" : "图片节点"}
                    </div>
                    <Textarea
                      value={nodeDraft}
                      onChange={(event) => setNodeDraft(event.target.value)}
                      className="min-h-[88px] resize-y border-black/10 bg-white text-[13px] text-zinc-700 shadow-sm focus-visible:ring-1 focus-visible:ring-emerald-500"
                    />
                  </div>
                ) : (
                  <div className="text-sm italic text-black/40">先在列表中选择一个节点</div>
                )}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-4 w-1 rounded-full bg-orange-500" />
              <h3 className="text-sm font-semibold text-[#1d1d1f]">Spectra 助手</h3>
            </div>
            <div className="space-y-3">
              {isLoading ? (
                <div className="flex items-center gap-2 text-[13px] text-black/40">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载中...
                </div>
              ) : messages.length === 0 ? (
                <div className="rounded-xl border border-orange-100/50 bg-orange-50/50 p-3 text-[13px] text-black/40">
                  可在此处输入指令，例如：<br />
                  <span className="font-medium text-orange-600">“重做第 3 页，强调对比表”</span>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn("flex w-full", message.role === "user" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
                        message.role === "user"
                          ? "rounded-tr-sm bg-black text-white"
                          : "rounded-tl-sm border border-black/5 bg-white text-zinc-800 shadow-sm"
                      )}
                    >
                      {message.content}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      <div className="shrink-0 border-t border-black/5 bg-white p-4">
        <div className="relative">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="告诉 Copilot 需要如何修改..."
            className="min-h-[80px] resize-none border-black/10 bg-zinc-50 pb-10 text-[13px] shadow-inner-sm focus-visible:ring-1 focus-visible:ring-black/20"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
          />
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            <span className="px-1 text-[10px] font-medium text-black/30">按 Enter 发送</span>
            <Button
              size="sm"
              onClick={() => void handleSend()}
              disabled={!sessionId || !input.trim() || isSubmitting}
              className="h-7 rounded-md bg-black px-3 text-xs font-medium text-white shadow-sm transition-transform active:scale-95 disabled:bg-black/20"
            >
              {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : "发送指令"}
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
