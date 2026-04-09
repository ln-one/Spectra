"use client";

import { Ban, RefreshCw, Trash2, UserCog, UserPlus, Users } from "lucide-react";
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
  newMemberRole: "owner" | "editor" | "viewer";
  setNewMemberRole: (value: "owner" | "editor" | "viewer") => void;
  onAddMember: () => void;
  onUpdateMemberRole: (
    memberId: string,
    role: "owner" | "editor" | "viewer"
  ) => void;
  onToggleMemberStatus: (
    memberId: string,
    currentStatus: ProjectMember["status"]
  ) => void;
  onDeleteMember: (memberId: string) => void;
  onReload: () => void;
}

export function MembersTab({
  members,
  state,
  newMemberUserId,
  setNewMemberUserId,
  newMemberRole,
  setNewMemberRole,
  onAddMember,
  onUpdateMemberRole,
  onToggleMemberStatus,
  onDeleteMember,
  onReload,
}: MembersTabProps) {
  return (
    <TabsContent value="members" className="mt-0 space-y-4">
      <div className="grid grid-cols-6 gap-2">
        <Input
          value={newMemberUserId}
          onChange={(event) => setNewMemberUserId(event.target.value)}
          placeholder="输入 userId"
          className="col-span-4 h-9 rounded-xl border-zinc-200/60 bg-white/50 backdrop-blur-sm focus-visible:ring-zinc-400/20 focus-visible:border-zinc-300 shadow-sm transition-all"
        />
        <select
          value={newMemberRole}
          onChange={(event) =>
            setNewMemberRole(
              event.target.value as "owner" | "editor" | "viewer"
            )
          }
          className="col-span-1 h-9 rounded-xl border border-zinc-200/60 bg-white/60 px-2 text-xs"
        >
          <option value="viewer">viewer</option>
          <option value="editor">editor</option>
          <option value="owner">owner</option>
        </select>
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
              title={item.userId}
              subtitle={`${item.role} 路 ${item.status}`}
              action={
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => onUpdateMemberRole(item.id, "editor")}
                    title="设为 editor"
                  >
                    <UserCog className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => onToggleMemberStatus(item.id, item.status)}
                    title={item.status === "active" ? "禁用成员" : "启用成员"}
                  >
                    <Ban className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => onDeleteMember(item.id)}
                    title="移除成员"
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
