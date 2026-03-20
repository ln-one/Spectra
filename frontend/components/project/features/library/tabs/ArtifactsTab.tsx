"use client";

import { FileText, PencilLine, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { PaneState, RowCard, type TabState } from "../shared";
import type { Artifact } from "../types";

interface ArtifactsTabProps {
  artifacts: Artifact[];
  state: TabState;
  onCreateArtifact: () => void;
  onReload: () => void;
}

export function ArtifactsTab({
  artifacts,
  state,
  onCreateArtifact,
  onReload,
}: ArtifactsTabProps) {
  return (
    <TabsContent value="artifacts" className="mt-0">
      <div className="flex justify-between gap-2 mb-4">
        <Button
          size="sm"
          onClick={onCreateArtifact}
          className="h-9 rounded-xl shadow-sm bg-white/60 backdrop-blur-sm text-zinc-700 border-zinc-200/60 hover:bg-white/80 border"
        >
          <PencilLine className="w-4 h-4 mr-1.5 text-zinc-500" />
          新建工件占位
        </Button>
        <Button
          size="icon"
          variant="outline"
          onClick={onReload}
          className="h-9 w-9 rounded-xl shadow-sm bg-white/50 backdrop-blur-sm border-zinc-200/60 hover:bg-white/80 hover:border-zinc-300"
        >
          <RefreshCw className="w-4 h-4 text-zinc-500" />
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
              subtitle={`session=${item.session_id ?? "-"} 路 version=${item.based_on_version_id ?? "-"}`}
            />
          ))}
        </div>
      ) : null}
    </TabsContent>
  );
}
