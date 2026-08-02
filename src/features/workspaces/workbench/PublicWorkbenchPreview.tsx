"use client";

import { BookOpenText, Check, ListChecks, Network, Presentation, Sparkles } from "lucide-react";
import { SpectraLogo } from "@/components/icons/SpectraLogo";
import type { ArtifactHistoryItem } from "@/features/artifacts/types";
import { sourceFilePresentation } from "@/features/sources/ui/source-file-presentation";
import { PanelShell } from "./PanelShell";
import { SourcesPanelView } from "./SourcesPanelView";
import { StudioPanelView } from "./StudioPanelView";
import { STUDIO_TOOL_IDS } from "./studioTools";
import type { SourceItemViewModel } from "./types";
import { WorkbenchPanelLayout } from "./WorkbenchPanelLayout";

const previewArtifactHistory: readonly ArtifactHistoryItem[] = [
  {
    createdAt: "2026-07-29T12:00:00.000Z",
    currentRevisionId: "cabfce6f-c4a5-45fe-a047-4fc0ed4e663f",
    generationState: "ready",
    id: "80675dae-f7af-4be5-81a6-21ba128a40e4",
    kind: "presentation",
    title: "新的知识表达",
    updatedAt: "2026-07-29T12:00:00.000Z",
  },
  {
    createdAt: "2026-07-29T11:54:00.000Z",
    currentRevisionId: "2050cf6e-dc39-4247-9a98-70a0b60855ea",
    generationState: "ready",
    id: "1fb69856-fc10-4a1c-8581-344779e3e990",
    kind: "teaching_document",
    title: "知识脉络讲义",
    updatedAt: "2026-07-29T11:54:00.000Z",
  },
  {
    createdAt: "2026-07-29T11:48:00.000Z",
    currentRevisionId: "114afcaa-1106-4998-968d-48767e95d249",
    generationState: "ready",
    id: "0e15127b-e28e-486e-943b-a5adad37cb7a",
    kind: "mind_map",
    title: "概念关系图",
    updatedAt: "2026-07-29T11:48:00.000Z",
  },
  {
    createdAt: "2026-07-29T11:42:00.000Z",
    currentRevisionId: "4c5df3fa-26a0-4054-af9e-87d5ae1ddbd0",
    generationState: "ready",
    id: "103eb807-a4ef-41ae-9e8b-080d8df58ad0",
    kind: "quiz",
    title: "理解检验",
    updatedAt: "2026-07-29T11:42:00.000Z",
  },
];

export const PUBLIC_PREVIEW_SOURCE_SPECS = [
  ["课程讲义", "lecture.pdf"],
  ["演示文稿", "presentation.pptx"],
  ["教学笔记", "notes.docx"],
  ["数据表", "references.xlsx"],
  ["参考图像", "reference.png"],
  ["访谈录音", "interview.mp3"],
  ["课堂录像", "classroom.mp4"],
  ["研究摘录", "research.md"],
  ["分析笔记", "analysis.ipynb"],
] as const;

const previewSources: readonly SourceItemViewModel[] = PUBLIC_PREVIEW_SOURCE_SPECS.map(
  ([name, fileName], index) => {
    const presentation = sourceFilePresentation(fileName);
    return {
      id: `public-preview-source-${index + 1}`,
      name,
      status: `${fileName.split(".").at(-1)?.toUpperCase()} · 已建立上下文`,
      Icon: presentation.Icon,
      iconTone: presentation.iconTone,
      kind: "file",
      selected: false,
      canOpen: false,
      canDelete: false,
      statusTone: "success",
    };
  },
);

export function PublicWorkbenchPreview() {
  return (
    <section
      aria-label="Spectra 工作台预览"
      className="pointer-events-none relative flex h-full min-h-0 flex-col overflow-hidden"
      inert
    >
      <div className="flex h-[62px] shrink-0 items-center justify-between px-6">
        <div className="flex items-center gap-2.5 text-sm font-semibold text-[var(--workspace-text-primary)]">
          <SpectraLogo className="h-7 w-7" blendMode="normal" />
          <span>Spectra</span>
        </div>
        <span className="text-sm font-semibold text-[var(--workspace-text-primary)]">
          从资料到作品
        </span>
        <span className="rounded-full border border-[var(--workspace-border)] bg-[var(--workspace-surface)] px-3 py-1 text-xs font-medium text-[var(--workspace-text-muted)] shadow-sm">
          工作台
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <WorkbenchPanelLayout
          chat={<PreviewChatPanel />}
          disclaimer="Spectra 输出内容可能存在偏差，请在使用前进行复核。"
          disabled
          persistPanelState={false}
          sources={
            <SourcesPanelView
              title="资料来源"
              summary={`${previewSources.length} 项资料 · 多模态`}
              sources={previewSources}
            />
          }
          studio={(controls) => (
            <StudioPanelView
              title="备课工坊"
              subtitle="AI 生成工具"
              tools={STUDIO_TOOL_IDS}
              artifactHistory={previewArtifactHistory}
              artifactHistoryError={false}
              artifactHref={() => "/auth/register"}
              formatArtifactTimestamp={() => "20:00"}
              isRefreshingHistory={false}
              onRefreshHistory={() => undefined}
              onDeleteArtifact={async () => undefined}
              selectedArtifactId={null}
              collapsed={controls.collapsed}
              historyFocusRequest={controls.historyFocusRequest}
              onExpand={controls.expand}
              onShowHistory={controls.showHistory}
            />
          )}
          workspaceId="public-workbench-preview"
        />
      </div>
    </section>
  );
}

function PreviewChatPanel() {
  return (
    <PanelShell className="workspace-assistant-tone-panel" testId="public-preview-chat-panel">
      <div className="flex h-[52px] items-center px-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold leading-tight">智能助手</h2>
          <div className="mt-0.5 text-xs font-medium leading-tight text-[var(--workspace-text-muted)]">
            AI 助手对话
          </div>
        </div>
      </div>
      <div className="flex h-[calc(100%-52px)] min-h-0 flex-col px-4 pb-4">
        <div className="min-h-0 flex-1 overflow-hidden py-4">
          <div className="rounded-2xl bg-[var(--workspace-surface-muted)] px-4 py-3 text-sm leading-6 text-[var(--workspace-text-primary)]">
            把这些资料整理成一套可讲、可读、可互动的知识内容。
          </div>
          <div className="mt-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--workspace-text-primary)]">
              <Sparkles className="h-4 w-4 text-violet-600" />
              已建立资料上下文
            </div>
            <p className="mt-3 text-sm leading-7 text-[var(--workspace-text-muted)]">
              我会提取主题、结构与重点，再选择合适的表达方式。
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <ContextCard Icon={BookOpenText} label="核心概念" value="12 个主题" tone="blue" />
              <ContextCard Icon={Network} label="关系脉络" value="4 层结构" tone="teal" />
              <ContextCard Icon={ListChecks} label="学习目标" value="6 项任务" tone="violet" />
            </div>
          </div>
          <div
            data-studio-tone="orange"
            className="relative mt-5 overflow-hidden rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] p-4"
          >
            <div className="workspace-tool-card-aura pointer-events-none absolute -left-12 -top-12 h-36 w-36 rounded-full opacity-60" />
            <div className="relative flex items-center gap-3">
              <span className="workspace-tool-icon-container flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border">
                <Presentation className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[var(--studio-accent-text)]">
                  创作方案已准备
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-[var(--workspace-text-primary)]">
                  一套知识，六种可继续编辑的表达
                </p>
              </div>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--studio-surface)] text-[var(--studio-accent-text)]">
                <Check className="h-4 w-4" />
              </span>
            </div>
          </div>
        </div>
        <div className="workspace-chat-input-shell flex h-[52px] shrink-0 items-center justify-between rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] px-4 text-sm text-[var(--workspace-text-muted)]">
          <span>输入你的想法或任务</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--workspace-surface-muted)]">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </PanelShell>
  );
}

function ContextCard({
  Icon,
  label,
  tone,
  value,
}: {
  Icon: typeof BookOpenText;
  label: string;
  tone: "blue" | "teal" | "violet";
  value: string;
}) {
  return (
    <div
      data-studio-tone={tone}
      className="relative overflow-hidden rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] p-3"
    >
      <div className="workspace-tool-card-aura pointer-events-none absolute -left-8 -top-8 h-24 w-24 rounded-full opacity-50" />
      <span className="workspace-tool-icon-container relative flex h-8 w-8 items-center justify-center rounded-lg border">
        <Icon className="h-4 w-4" />
      </span>
      <p className="relative mt-3 text-xs font-semibold text-[var(--workspace-text-primary)]">
        {label}
      </p>
      <p className="relative mt-1 text-[10px] font-medium text-[var(--studio-accent-text)]">
        {value}
      </p>
    </div>
  );
}
