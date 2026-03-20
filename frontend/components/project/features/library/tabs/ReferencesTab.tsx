"use client";

import { Link as LinkIcon, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { PaneState, RowCard, type TabState } from "../shared";
import type { ProjectReference } from "../types";

interface ReferencesTabProps {
  references: ProjectReference[];
  state: TabState;
  newReferenceTarget: string;
  setNewReferenceTarget: (value: string) => void;
  onAddReference: () => void;
  onDeleteReference: (referenceId: string) => void;
  onReload: () => void;
}

export function ReferencesTab({
  references,
  state,
  newReferenceTarget,
  setNewReferenceTarget,
  onAddReference,
  onDeleteReference,
  onReload,
}: ReferencesTabProps) {
  return (
    <TabsContent value="references" className="mt-0">
      <div className="flex gap-2 mb-4">
        <Input
          value={newReferenceTarget}
          onChange={(event) => setNewReferenceTarget(event.target.value)}
          placeholder="输入 target_project_id"
          className="h-9 rounded-xl border-zinc-200/60 bg-white/50 backdrop-blur-sm focus-visible:ring-zinc-400/20 focus-visible:border-zinc-300 shadow-sm transition-all"
        />
        <Button
          size="sm"
          onClick={onAddReference}
          className="h-9 rounded-xl shadow-sm bg-zinc-600 hover:bg-zinc-700"
        >
          <Plus className="w-4 h-4 mr-1" />
          新增
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
        hasData={references.length > 0}
        emptyLabel="当前没有引用，先添加一个关联库。"
        onRetry={onReload}
      />

      {!state.loading && !state.error && references.length > 0 ? (
        <div className="space-y-3">
          {references.map((item) => (
            <RowCard
              key={item.id}
              icon={LinkIcon}
              title={item.target_project_id}
              subtitle={`${item.relation_type} 路 ${item.mode} 路 ${item.status}`}
              action={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                  onClick={() => onDeleteReference(item.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              }
            />
          ))}
        </div>
      ) : null}
    </TabsContent>
  );
}
