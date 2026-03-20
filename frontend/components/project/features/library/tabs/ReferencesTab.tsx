"use client";

import {
  ArrowDownUp,
  Link as LinkIcon,
  Plus,
  RefreshCw,
  ToggleLeft,
  Trash2,
} from "lucide-react";
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
  newReferenceRelationType: "base" | "auxiliary";
  setNewReferenceRelationType: (value: "base" | "auxiliary") => void;
  newReferenceMode: "follow" | "pinned";
  setNewReferenceMode: (value: "follow" | "pinned") => void;
  newReferencePinnedVersion: string;
  setNewReferencePinnedVersion: (value: string) => void;
  newReferencePriority: string;
  setNewReferencePriority: (value: string) => void;
  onAddReference: () => void;
  onDeleteReference: (referenceId: string) => void;
  onToggleReferenceStatus: (
    referenceId: string,
    currentStatus: ProjectReference["status"]
  ) => void;
  onUpdateReferencePriority: (referenceId: string, priority: number) => void;
  onReload: () => void;
}

export function ReferencesTab({
  references,
  state,
  newReferenceTarget,
  setNewReferenceTarget,
  newReferenceRelationType,
  setNewReferenceRelationType,
  newReferenceMode,
  setNewReferenceMode,
  newReferencePinnedVersion,
  setNewReferencePinnedVersion,
  newReferencePriority,
  setNewReferencePriority,
  onAddReference,
  onDeleteReference,
  onToggleReferenceStatus,
  onUpdateReferencePriority,
  onReload,
}: ReferencesTabProps) {
  return (
    <TabsContent value="references" className="mt-0 space-y-4">
      <div className="grid grid-cols-6 gap-2">
        <Input
          value={newReferenceTarget}
          onChange={(event) => setNewReferenceTarget(event.target.value)}
          placeholder="target_project_id"
          className="col-span-3 h-9 rounded-xl border-zinc-200/60 bg-white/50 backdrop-blur-sm focus-visible:ring-zinc-400/20 focus-visible:border-zinc-300 shadow-sm transition-all"
        />
        <select
          value={newReferenceRelationType}
          onChange={(event) =>
            setNewReferenceRelationType(
              event.target.value as "base" | "auxiliary"
            )
          }
          className="col-span-1 h-9 rounded-xl border border-zinc-200/60 bg-white/60 px-2 text-xs"
        >
          <option value="base">主基底</option>
          <option value="auxiliary">辅助</option>
        </select>
        <select
          value={newReferenceMode}
          onChange={(event) =>
            setNewReferenceMode(event.target.value as "follow" | "pinned")
          }
          className="col-span-1 h-9 rounded-xl border border-zinc-200/60 bg-white/60 px-2 text-xs"
        >
          <option value="follow">follow</option>
          <option value="pinned">pinned</option>
        </select>
        <Input
          value={newReferencePriority}
          onChange={(event) => setNewReferencePriority(event.target.value)}
          placeholder="优先级"
          className="col-span-1 h-9 rounded-xl border-zinc-200/60 bg-white/50 text-xs"
        />
        {newReferenceMode === "pinned" ? (
          <Input
            value={newReferencePinnedVersion}
            onChange={(event) =>
              setNewReferencePinnedVersion(event.target.value)
            }
            placeholder="pinned_version_id"
            className="col-span-4 h-9 rounded-xl border-zinc-200/60 bg-white/50 text-xs"
          />
        ) : null}
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
              subtitle={`${item.relation_type} 路 ${item.mode} 路 ${item.status} 路 优先级 ${item.priority ?? 0}`}
              action={
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() =>
                      onToggleReferenceStatus(item.id, item.status)
                    }
                    title={item.status === "active" ? "禁用" : "启用"}
                  >
                    <ToggleLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => {
                      const value = window.prompt(
                        "输入新的 priority（整数）",
                        String(item.priority ?? 0)
                      );
                      if (value == null) return;
                      const priority = Number.parseInt(value, 10);
                      if (Number.isNaN(priority)) return;
                      onUpdateReferencePriority(item.id, priority);
                    }}
                    title="调整优先级"
                  >
                    <ArrowDownUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => onDeleteReference(item.id)}
                    title="删除引用"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              }
            />
          ))}
        </div>
      ) : null}
    </TabsContent>
  );
}
