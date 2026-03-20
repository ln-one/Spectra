"use client";

import { GitPullRequest, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { PaneState, RowCard, type TabState } from "../shared";
import type { CandidateChange } from "../types";
import { formatTime } from "../utils";

interface ChangesTabProps {
  changes: CandidateChange[];
  state: TabState;
  onReload: () => void;
}

export function ChangesTab({ changes, state, onReload }: ChangesTabProps) {
  return (
    <TabsContent value="changes" className="mt-0">
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
        hasData={changes.length > 0}
        emptyLabel="候选变更为空，复杂审核流 Phase 1 先占位。"
        onRetry={onReload}
      />

      {!state.loading && !state.error && changes.length > 0 ? (
        <div className="space-y-3">
          {changes.map((item) => (
            <RowCard
              key={item.id}
              icon={GitPullRequest}
              title={item.title}
              subtitle={`${item.status} 路 ${formatTime(item.created_at)}`}
            />
          ))}
        </div>
      ) : null}
    </TabsContent>
  );
}
