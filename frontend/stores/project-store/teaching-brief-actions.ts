import { generateApi } from "@/lib/sdk";
import { getErrorMessage } from "@/lib/sdk/errors";
import { toast } from "@/hooks/use-toast";
import {
  buildGenerationConfigFromTeachingBrief,
  startCoursewarePptRun,
} from "./courseware-run";
import { resolveReadySelectedFileIds } from "./source-scope";
import type {
  ProjectStoreContext,
  ProjectState,
  SessionStatePayloadWithBrief,
} from "./types";

type TeachingBriefActionKeys =
  | "refreshGenerationSession"
  | "updateTeachingBriefDraft"
  | "applyTeachingBriefProposal"
  | "dismissTeachingBriefProposal"
  | "confirmTeachingBrief"
  | "startPptFromTeachingBrief";

function resolveActiveSessionId(get: ProjectStoreContext["get"], sessionId?: string | null) {
  return sessionId ?? get().activeSessionId ?? get().generationSession?.session?.session_id ?? null;
}

async function syncSessionSnapshot(
  set: ProjectStoreContext["set"],
  get: ProjectStoreContext["get"],
  sessionId: string,
  runId?: string | null
): Promise<SessionStatePayloadWithBrief | null> {
  const response = await generateApi.getSessionSnapshot(sessionId, {
    run_id: runId ?? undefined,
  });
  const snapshot = (response?.data ?? null) as SessionStatePayloadWithBrief | null;
  const snapshotCurrentRunId =
    snapshot && typeof snapshot === "object"
      ? ((snapshot as { current_run?: { run_id?: string | null } }).current_run
          ?.run_id ?? null)
      : null;
  set((state) => ({
    generationSession: snapshot,
    activeSessionId: sessionId,
    activeRunId: snapshotCurrentRunId ?? runId ?? state.activeRunId,
  }));
  return snapshot;
}

export function createTeachingBriefActions({
  set,
  get,
}: ProjectStoreContext): Pick<ProjectState, TeachingBriefActionKeys> {
  return {
    refreshGenerationSession: async (sessionId, options) => {
      const effectiveSessionId = resolveActiveSessionId(get, sessionId);
      if (!effectiveSessionId) return null;
      try {
        return await syncSessionSnapshot(
          set,
          get,
          effectiveSessionId,
          options?.runId ?? get().activeRunId
        );
      } catch (error) {
        toast({
          title: "刷新会话失败",
          description: getErrorMessage(error),
          variant: "destructive",
        });
        return null;
      }
    },

    updateTeachingBriefDraft: async (sessionId, patch) => {
      try {
        await generateApi.sendCommand(sessionId, {
          command: {
            command_type: "UPDATE_TEACHING_BRIEF_DRAFT",
            patch,
          },
        });
        await syncSessionSnapshot(set, get, sessionId);
      } catch (error) {
        toast({
          title: "更新教学需求单失败",
          description: getErrorMessage(error),
          variant: "destructive",
        });
        throw error;
      }
    },

    applyTeachingBriefProposal: async (sessionId, proposalId) => {
      try {
        await generateApi.sendCommand(sessionId, {
          command: {
            command_type: "APPLY_TEACHING_BRIEF_PROPOSAL",
            proposal_id: proposalId,
          },
        });
        await syncSessionSnapshot(set, get, sessionId);
      } catch (error) {
        toast({
          title: "应用需求候选更新失败",
          description: getErrorMessage(error),
          variant: "destructive",
        });
        throw error;
      }
    },

    dismissTeachingBriefProposal: async (sessionId, proposalId) => {
      try {
        await generateApi.sendCommand(sessionId, {
          command: {
            command_type: "DISMISS_TEACHING_BRIEF_PROPOSAL",
            proposal_id: proposalId,
          },
        });
        await syncSessionSnapshot(set, get, sessionId);
      } catch (error) {
        toast({
          title: "忽略需求候选更新失败",
          description: getErrorMessage(error),
          variant: "destructive",
        });
        throw error;
      }
    },

    confirmTeachingBrief: async (sessionId, patch) => {
      try {
        await generateApi.sendCommand(sessionId, {
          command: {
            command_type: "CONFIRM_TEACHING_BRIEF",
            patch,
          },
        });
        await syncSessionSnapshot(set, get, sessionId);
      } catch (error) {
        toast({
          title: "确认教学需求单失败",
          description: getErrorMessage(error),
          variant: "destructive",
        });
        throw error;
      }
    },

    startPptFromTeachingBrief: async (sessionId) => {
      const state = get();
      const effectiveSessionId = resolveActiveSessionId(get, sessionId);
      const projectId = state.project?.id;
      const brief = state.generationSession?.teaching_brief;
      if (!effectiveSessionId || !projectId || !brief) {
        return null;
      }
      if (brief.status !== "confirmed" || brief.readiness?.can_generate !== true) {
        toast({
          title: "教学需求单尚未确认",
          description: "请先补齐并确认教学需求单，再开始生成 PPT。",
          variant: "destructive",
        });
        return null;
      }

      const readySelectedFileIds = resolveReadySelectedFileIds(
        state.files,
        state.selectedFileIds
      );
      try {
        const result = await startCoursewarePptRun({
          projectId,
          clientSessionId: effectiveSessionId,
          ragSourceIds: readySelectedFileIds,
          config: buildGenerationConfigFromTeachingBrief(brief),
          teachingBrief: brief,
        });
        await syncSessionSnapshot(set, get, result.sessionId, result.runId);
        set({
          activeSessionId: result.sessionId,
          activeRunId: result.runId,
        });
        await get().fetchGenerationHistory(projectId);
        await get().fetchArtifactHistory(projectId, result.sessionId);
        toast({
          title: "课件生成任务已启动",
          description: "系统已创建新的 PPT run，后续仍需在大纲界面手动确认。",
        });
        return result;
      } catch (error) {
        toast({
          title: "启动 PPT 生成失败",
          description: getErrorMessage(error),
          variant: "destructive",
        });
        throw error;
      }
    },
  };
}
