"use client";

import { Download, FileText, PencilLine, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { PaneState, RowCard, type TabState } from "../shared";
import type { Artifact } from "../types";

interface ArtifactsTabProps {
  artifacts: Artifact[];
  state: TabState;
  newArtifactType: "mindmap" | "summary" | "exercise" | "html" | "gif" | "mp4";
  setNewArtifactType: (
    value: "mindmap" | "summary" | "exercise" | "html" | "gif" | "mp4"
  ) => void;
  newArtifactVisibility: "private" | "project-visible" | "shared";
  setNewArtifactVisibility: (
    value: "private" | "project-visible" | "shared"
  ) => void;
  newArtifactMode: "create" | "replace";
  setNewArtifactMode: (value: "create" | "replace") => void;
  newArtifactSessionId: string;
  setNewArtifactSessionId: (value: string) => void;
  newArtifactBasedVersionId: string;
  setNewArtifactBasedVersionId: (value: string) => void;
  onCreateArtifact: () => void;
  onDownloadArtifact: (artifactId: string) => void;
  onReload: () => void;
}

export function ArtifactsTab({
  artifacts,
  state,
  newArtifactType,
  setNewArtifactType,
  newArtifactVisibility,
  setNewArtifactVisibility,
  newArtifactMode,
  setNewArtifactMode,
  newArtifactSessionId,
  setNewArtifactSessionId,
  newArtifactBasedVersionId,
  setNewArtifactBasedVersionId,
  onCreateArtifact,
  onDownloadArtifact,
  onReload,
}: ArtifactsTabProps) {
  return (
    <TabsContent value="artifacts" className="mt-0 space-y-4">
      <div className="grid grid-cols-6 gap-2">
        <select
          value={newArtifactType}
          onChange={(event) =>
            setNewArtifactType(
              event.target.value as
                | "mindmap"
                | "summary"
                | "exercise"
                | "html"
                | "gif"
                | "mp4"
            )
          }
          className="col-span-2 h-9 rounded-xl border border-zinc-200/60 bg-white/60 px-2 text-xs"
        >
          <option value="summary">summary</option>
          <option value="mindmap">mindmap</option>
          <option value="exercise">exercise</option>
          <option value="html">html</option>
          <option value="gif">gif</option>
          <option value="mp4">mp4</option>
        </select>
        <select
          value={newArtifactVisibility}
          onChange={(event) =>
            setNewArtifactVisibility(
              event.target.value as "private" | "project-visible" | "shared"
            )
          }
          className="col-span-2 h-9 rounded-xl border border-zinc-200/60 bg-white/60 px-2 text-xs"
        >
          <option value="private">private</option>
          <option value="project-visible">project-visible</option>
          <option value="shared">shared</option>
        </select>
        <select
          value={newArtifactMode}
          onChange={(event) =>
            setNewArtifactMode(event.target.value as "create" | "replace")
          }
          className="col-span-1 h-9 rounded-xl border border-zinc-200/60 bg-white/60 px-2 text-xs"
        >
          <option value="create">create</option>
          <option value="replace">replace</option>
        </select>
        <Button
          size="icon"
          variant="outline"
          onClick={onReload}
          className="h-9 w-9 rounded-xl shadow-sm bg-white/50 backdrop-blur-sm border-zinc-200/60 hover:bg-white/80 hover:border-zinc-300"
        >
          <RefreshCw className="w-4 h-4 text-zinc-500" />
        </Button>
        <Input
          value={newArtifactSessionId}
          onChange={(event) => setNewArtifactSessionId(event.target.value)}
          placeholder="session_id（可选）"
          className="col-span-3 h-9 rounded-xl border-zinc-200/60 bg-white/50 text-xs"
        />
        <Input
          value={newArtifactBasedVersionId}
          onChange={(event) => setNewArtifactBasedVersionId(event.target.value)}
          placeholder="based_on_version_id（可选）"
          className="col-span-2 h-9 rounded-xl border-zinc-200/60 bg-white/50 text-xs"
        />
        <Button
          size="sm"
          onClick={onCreateArtifact}
          className="h-9 rounded-xl shadow-sm bg-white/60 backdrop-blur-sm text-zinc-700 border-zinc-200/60 hover:bg-white/80 border"
        >
          <PencilLine className="w-4 h-4 mr-1.5 text-zinc-500" />
          新建工件
        </Button>
      </div>

      <PaneState
        state={state}
        hasData={artifacts.length > 0}
        emptyLabel="当前会话还没有工件。"
        onRetry={onReload}
      />

      {!state.loading && !state.error && artifacts.length > 0 ? (
        <div className="space-y-3">
          {artifacts.map((item) => (
            <RowCard
              key={item.id}
              icon={FileText}
              title={`${item.type} 路 ${item.id.slice(0, 8)}`}
              subtitle={`session=${item.session_id ?? "-"} 路 version=${item.based_on_version_id ?? "-"} 路 ${item.visibility}`}
              action={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={() => onDownloadArtifact(item.id)}
                  title="下载工件"
                >
                  <Download className="w-4 h-4" />
                </Button>
              }
            />
          ))}
        </div>
      ) : null}
    </TabsContent>
  );
}
