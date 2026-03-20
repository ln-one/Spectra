"use client";

import { RefreshCw, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { PaneState, RowCard, type TabState } from "../shared";
import type { ProjectMember } from "../types";

interface MembersTabProps {
  members: ProjectMember[];
  state: TabState;
  newMemberUserId: string;
  setNewMemberUserId: (value: string) => void;
  onAddMember: () => void;
  onReload: () => void;
}

export function MembersTab({
  members,
  state,
  newMemberUserId,
  setNewMemberUserId,
  onAddMember,
  onReload,
}: MembersTabProps) {
  return (
    <TabsContent value="members" className="mt-0">
      <div className="flex gap-2 mb-4">
        <Input
          value={newMemberUserId}
          onChange={(event) => setNewMemberUserId(event.target.value)}
          placeholder="输入 user_id"
          className="h-9 rounded-xl border-zinc-200/60 bg-white/50 backdrop-blur-sm focus-visible:ring-zinc-400/20 focus-visible:border-zinc-300 shadow-sm transition-all"
        />
        <Button
          size="sm"
          onClick={onAddMember}
          className="h-9 rounded-xl shadow-sm bg-zinc-600 hover:bg-zinc-700"
        >
          <UserPlus className="w-4 h-4 mr-1" />
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
        hasData={members.length > 0}
        emptyLabel="当前没有成员记录。"
        onRetry={onReload}
      />

      {!state.loading && !state.error && members.length > 0 ? (
        <div className="space-y-3">
          {members.map((item) => (
            <RowCard
              key={item.id}
              icon={Users}
              title={item.user_id}
              subtitle={`${item.role} 路 ${item.status}`}
            />
          ))}
        </div>
      ) : null}
    </TabsContent>
  );
}
