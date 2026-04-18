"use client";

import { Download, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ShowcaseCardId =
  | "word_document"
  | "knowledge_mindmap"
  | "speaker_notes"
  | "interactive_quick_quiz";

type ArtifactStatus = {
  artifactId: string;
  artifactType: string;
  localPath: string;
  downloadUrl: string | null;
  elapsedSeconds: number | null;
  createdAt: string | null;
  title: string;
};

export interface ShowcaseCardData {
  id: ShowcaseCardId;
  label: string;
  status: number;
  artifact: ArtifactStatus;
  payload: Record<string, unknown> | null;
  markdown?: string | null;
  summary?: string | null;
}

interface ShowcasePageClientProps {
  projectId: string;
  sourceArtifactId: string;
  cards: ShowcaseCardData[];
  defaultTab?: ShowcaseCardId;
}

function formatElapsed(elapsedSeconds: number | null): string {
  return elapsedSeconds == null ? "未知" : `${elapsedSeconds.toFixed(2)}s`;
}

function formatCreatedAt(value: string | null): string {
  if (!value) return "未知";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function summarizePayload(payload: Record<string, unknown> | null): string {
  if (!payload) return "当前结果没有结构化 payload。";
  if (Array.isArray(payload.nodes)) {
    return `节点数：${payload.nodes.length}`;
  }
  if (Array.isArray(payload.slides)) {
    return `讲稿页数：${payload.slides.length}`;
  }
  if (Array.isArray(payload.questions)) {
    return `题目数：${payload.questions.length}`;
  }
  if (payload.document_content && typeof payload.document_content === "object") {
    return "已包含结构化 document_content。";
  }
  const keys = Object.keys(payload);
  return keys.length > 0 ? `字段：${keys.join(" / ")}` : "payload 为空对象。";
}

function CardEvidence({ card }: { card: ShowcaseCardData }) {
  return (
    <section className="space-y-4 rounded-[24px] border border-zinc-300 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{card.id}</Badge>
        <Badge variant="outline">HTTP {card.status}</Badge>
        <Badge variant="outline">{card.artifact.artifactType}</Badge>
        <Badge variant="outline">{formatElapsed(card.artifact.elapsedSeconds)}</Badge>
      </div>

      <div className="grid gap-3 text-sm text-zinc-700 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Artifact Id
          </p>
          <p className="mt-2 break-all font-medium text-zinc-900">
            {card.artifact.artifactId}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            最近生成
          </p>
          <p className="mt-2 font-medium text-zinc-900">
            {formatCreatedAt(card.artifact.createdAt)}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 md:col-span-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            证据摘要
          </p>
          <p className="mt-2 text-zinc-700">{summarizePayload(card.payload)}</p>
          {card.summary ? (
            <p className="mt-2 text-zinc-600">{card.summary}</p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 md:col-span-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            本地调试镜像
          </p>
          <p className="mt-2 break-all text-zinc-700">{card.artifact.localPath}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {card.artifact.downloadUrl ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() =>
              window.open(card.artifact.downloadUrl ?? "", "_blank", "noopener,noreferrer")
            }
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            下载真实 artifact
          </Button>
        ) : null}
      </div>

      <div className="rounded-[20px] border border-zinc-200 bg-zinc-950 p-4 text-xs leading-6 text-zinc-100">
        <p className="mb-2 font-semibold text-zinc-300">真实 payload 证据</p>
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words">
          {JSON.stringify(card.payload, null, 2)}
        </pre>
      </div>
    </section>
  );
}

export function ShowcasePageClient({
  projectId,
  sourceArtifactId,
  cards,
  defaultTab,
}: ShowcasePageClientProps) {
  const initialTab = defaultTab ?? cards[0]?.id ?? "word_document";
  const [activeTab, setActiveTab] = useState<ShowcaseCardId>(initialTab);
  const activeCard = useMemo(
    () => cards.find((card) => card.id === activeTab) ?? cards[0] ?? null,
    [activeTab, cards]
  );
  const formalTool =
    activeTab === "word_document"
      ? "word"
      : activeTab === "knowledge_mindmap"
        ? "mindmap"
        : activeTab === "speaker_notes"
          ? "summary"
          : "quiz";
  const formalProjectUrl = `/projects/${projectId}?tool=${formalTool}`;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#fffaf0,_#efe7da_60%,_#e7ddce)] px-6 py-8 text-zinc-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[32px] border border-zinc-300 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">
                Studio Evidence
              </p>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  正式 Studio 真实成果证据页
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-600">
                  这页只保留真实 API 运行结果、artifact id、下载口和 payload 证据，不再承担拟真产品展示。
                  真正的工作面应直接去正式 Project 页面里的 Studio 面板查看。
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-full px-4 text-xs"
                onClick={() => window.open(formalProjectUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                打开正式 Project 页面
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Project Id
              </p>
              <p className="mt-2 break-all text-sm font-medium text-zinc-900">
                {projectId}
              </p>
            </div>
            <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Source Artifact
              </p>
              <p className="mt-2 break-all text-sm font-medium text-zinc-900">
                {sourceArtifactId}
              </p>
            </div>
            <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                当前证据
              </p>
              <p className="mt-2 text-sm font-medium text-zinc-900">
                {activeCard ? activeCard.label : "暂无"}
              </p>
            </div>
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ShowcaseCardId)}>
          <TabsList className="h-auto flex-wrap gap-2 rounded-[28px] border border-zinc-300 bg-white/90 p-2 shadow-sm">
            {cards.map((card) => (
              <TabsTrigger
                key={card.id}
                value={card.id}
                className="rounded-full px-4 py-2 text-sm data-[state=active]:bg-zinc-900 data-[state=active]:text-white"
              >
                {card.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {cards.map((card) => (
            <TabsContent key={card.id} value={card.id} className="mt-5">
              <CardEvidence card={card} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </main>
  );
}
