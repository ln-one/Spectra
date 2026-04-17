"use client";

import { Check, GitPullRequest, RefreshCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { PaneState, RowCard, type TabState } from "../shared";
import type { CandidateChange } from "../types";
import { formatTime } from "../utils";

interface ChangesTabProps {
  changes: CandidateChange[];
  state: TabState;
  newChangeTitle: string;
  setNewChangeTitle: (value: string) => void;
  newChangeSummary: string;
  setNewChangeSummary: (value: string) => void;
  reviewComment: string;
  setReviewComment: (value: string) => void;
  onCreateCandidateChange: () => void;
  onReviewCandidateChange: (
    changeId: string,
    action: "accept" | "reject"
  ) => void;
  onReload: () => void;
}

export function ChangesTab({
  changes,
  state,
  newChangeTitle,
  setNewChangeTitle,
  newChangeSummary,
  setNewChangeSummary,
  reviewComment,
  setReviewComment,
  onCreateCandidateChange,
  onReviewCandidateChange,
  onReload,
}: ChangesTabProps) {
  return (
    <TabsContent value="changes" className="mt-0 space-y-4">
      <div className="grid grid-cols-6 gap-2">
        <Input
          value={newChangeTitle}
          onChange={(event) => setNewChangeTitle(event.target.value)}
          placeholder="候选变更标题"
          className="col-span-3 h-9 rounded-xl border-zinc-200/60 bg-white/50"
        />
        <Input
          value={newChangeSummary}
          onChange={(event) => setNewChangeSummary(event.target.value)}
          placeholder="摘要（可选）"
          className="col-span-2 h-9 rounded-xl border-zinc-200/60 bg-white/50"
        />
        <Button
          size="sm"
          onClick={onCreateCandidateChange}
          className="h-9 rounded-xl"
        >
          <Send className="w-4 h-4 mr-1" />
          提交
        </Button>
        <Input
          value={reviewComment}
          onChange={(event) => setReviewComment(event.target.value)}
          placeholder="审核备注（可选）"
          className="col-span-5 h-9 rounded-xl border-zinc-200/60 bg-white/50"
        />
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
        emptyLabel="候选变更为空，可直接在这里提交并审核。"
        onRetry={onReload}
      />

      {!state.loading && !state.error && changes.length > 0 ? (
        <div className="space-y-3">
          {changes.map((item) => (
            <RowCard
              key={item.id}
              icon={GitPullRequest}
              title={item.title}
              subtitle={`${item.status} 路 ${formatTime(item.createdAt)}`}
              action={
                item.status === "pending" ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50"
                      onClick={() => onReviewCandidateChange(item.id, "accept")}
                      title="接受"
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => onReviewCandidateChange(item.id, "reject")}
                      title="拒绝"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : null
              }
            />
          ))}
        </div>
      ) : null}
    </TabsContent>
  );
}
