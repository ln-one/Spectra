"use client";

import { GitMerge, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { PaneState, RowCard, type TabState } from "../shared";
import type { ProjectVersion } from "../types";
import { formatTime } from "../utils";

interface VersionsTabProps {
  versions: ProjectVersion[];
  state: TabState;
  onReload: () => void;
}

export function VersionsTab({ versions, state, onReload }: VersionsTabProps) {
  return (
    <TabsContent value="versions" className="mt-0">
      <div className="flex justify-end mb-4">
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
        hasData={versions.length > 0}
        emptyLabel="当前没有版本记录。"
        onRetry={onReload}
      />

      {!state.loading && !state.error && versions.length > 0 ? (
        <div className="space-y-3">
          {versions.map((item) => (
            <RowCard
              key={item.id}
              icon={GitMerge}
              title={item.summary || "无摘要"}
              subtitle={`${item.changeType} 路 ${formatTime(item.createdAt)}`}
            />
          ))}
        </div>
      ) : null}
    </TabsContent>
  );
}
