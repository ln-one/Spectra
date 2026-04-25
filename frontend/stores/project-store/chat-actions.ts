import { chatApi, studioCardsApi } from "@/lib/sdk";
import {
  createApiError,
  getChatRequestErrorMessage,
  getErrorMessage,
} from "@/lib/sdk/errors";
import { toast } from "@/hooks/use-toast";
import {
  buildRefineFailureMessage,
  buildRefineProcessingMessage,
  buildRefineSuccessMessage,
  buildStageHintMessage,
  createLocalMessage,
  readStudioLocalPayload,
  writeStudioLocalPayload,
} from "./studio-chat.helpers";
import { resolveReadySelectedFileIds } from "./source-scope";
import type {
  ChatGenerationConfirmDraft,
  Message,
  ProjectStoreContext,
  ProjectState,
  StudioChatContext,
  StudioHintMessagePayload,
} from "./types";

type ChatActionKeys =
  | "fetchMessages"
  | "sendMessage"
  | "sendStudioRefineMessage"
  | "hydrateStudioLocalState"
  | "setStudioChatContext"
  | "pushStudioHintMessage"
  | "focusChatComposer";

type CoursewareGenerationAction = "open_generation_confirm";

function normalizeCoursewareGenerationAction(
  value: unknown
): CoursewareGenerationAction | null {
  if (
    value === "open_generation_confirm"
  ) {
    return value;
  }
  return null;
}

function hasProjectLocalState(
  map: Record<string, unknown>,
  projectId: string
): boolean {
  return Object.prototype.hasOwnProperty.call(map, projectId);
}

function readFailureReason(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const details = (error as { details?: Record<string, unknown> }).details;
  const directFailure = details?.failure_reason;
  if (typeof directFailure === "string") return directFailure;
  const nestedFailure = details?.details;
  if (
    nestedFailure &&
    typeof nestedFailure === "object" &&
    typeof (nestedFailure as Record<string, unknown>).failure_reason === "string"
  ) {
    return String((nestedFailure as Record<string, unknown>).failure_reason);
  }
  return "";
}

function areConfigSnapshotsEqual(
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined
): boolean {
  if (left === right) return true;
  if (!left || !right) return !left && !right;
  const areValuesEqual = (lhs: unknown, rhs: unknown): boolean => {
    if (Object.is(lhs, rhs)) return true;
    if (Array.isArray(lhs) || Array.isArray(rhs)) {
      if (!Array.isArray(lhs) || !Array.isArray(rhs)) return false;
      if (lhs.length !== rhs.length) return false;
      return lhs.every((item, index) => areValuesEqual(item, rhs[index]));
    }
    if (
      lhs &&
      rhs &&
      typeof lhs === "object" &&
      typeof rhs === "object"
    ) {
      const lhsRecord = lhs as Record<string, unknown>;
      const rhsRecord = rhs as Record<string, unknown>;
      const lhsKeys = Object.keys(lhsRecord);
      const rhsKeys = Object.keys(rhsRecord);
      if (lhsKeys.length !== rhsKeys.length) return false;
      return lhsKeys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(rhsRecord, key) &&
          areValuesEqual(lhsRecord[key], rhsRecord[key])
      );
    }
    return false;
  };

  return areValuesEqual(left, right);
}

function areStudioChatContextsEqual(
  left: StudioChatContext | null,
  right: StudioChatContext | null
): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;
  return (
    left.projectId === right.projectId &&
    left.sessionId === right.sessionId &&
    left.toolType === right.toolType &&
    left.toolLabel === right.toolLabel &&
    left.cardId === right.cardId &&
    left.step === right.step &&
    left.canRefine === right.canRefine &&
    left.isRefineMode === right.isRefineMode &&
    left.targetArtifactId === right.targetArtifactId &&
    left.targetRunId === right.targetRunId &&
    left.sourceArtifactId === right.sourceArtifactId &&
    areConfigSnapshotsEqual(left.configSnapshot, right.configSnapshot)
  );
}

export function createChatActions({
  set,
  get,
}: ProjectStoreContext): Pick<ProjectState, ChatActionKeys> {
  let latestFetchRequestId = 0;
  let refineQueue = Promise.resolve();
  let refinePendingCount = 0;
  const ensureProjectLocalState = (projectId: string) => {
    const state = get();
    if (
      hasProjectLocalState(state.localToolMessages, projectId) &&
      hasProjectLocalState(state.studioHintDedupeByProject, projectId)
    ) {
      return;
    }

    const payload = readStudioLocalPayload(projectId);
    set((prev) => ({
      localToolMessages: {
        ...prev.localToolMessages,
        [projectId]: payload.messagesBySession,
      },
      studioHintDedupeByProject: {
        ...prev.studioHintDedupeByProject,
        [projectId]: payload.hintDedupe,
      },
    }));
  };

  const persistProjectLocalState = (
    projectId: string,
    messagesBySession: Record<string, Message[]>,
    hintDedupe: Record<string, true>
  ) => {
    writeStudioLocalPayload(projectId, {
      version: 1,
      messagesBySession,
      hintDedupe,
    });
  };

  const appendLocalMessage = (
    projectId: string,
    sessionId: string,
    message: Message
  ) => {
    ensureProjectLocalState(projectId);
    const state = get();
    const projectMessages = state.localToolMessages[projectId] ?? {};
    const projectHints = state.studioHintDedupeByProject[projectId] ?? {};
    const sessionMessages = projectMessages[sessionId] ?? [];
    const nextProjectMessages = {
      ...projectMessages,
      [sessionId]: [...sessionMessages, message].slice(-120),
    };

    set((prev) => ({
      localToolMessages: {
        ...prev.localToolMessages,
        [projectId]: nextProjectMessages,
      },
    }));

    persistProjectLocalState(projectId, nextProjectMessages, projectHints);
  };

  const updateLocalMessage = (
    projectId: string,
    sessionId: string,
    messageId: string,
    updater: (message: Message) => Message
  ) => {
    ensureProjectLocalState(projectId);
    const state = get();
    const projectMessages = state.localToolMessages[projectId] ?? {};
    const projectHints = state.studioHintDedupeByProject[projectId] ?? {};
    const sessionMessages = projectMessages[sessionId] ?? [];
    const messageIndex = sessionMessages.findIndex(
      (msg) => msg.id === messageId
    );
    if (messageIndex < 0) return;
    const nextSessionMessages = [...sessionMessages];
    nextSessionMessages[messageIndex] = updater(
      nextSessionMessages[messageIndex]
    );
    const nextProjectMessages = {
      ...projectMessages,
      [sessionId]: nextSessionMessages.slice(-120),
    };

    set((prev) => ({
      localToolMessages: {
        ...prev.localToolMessages,
        [projectId]: nextProjectMessages,
      },
    }));

    persistProjectLocalState(projectId, nextProjectMessages, projectHints);
  };

  const pushHintMessage = (payload: StudioHintMessagePayload) => {
    const { projectId, sessionId, dedupeKey, stage, toolLabel, toolType } =
      payload;
    ensureProjectLocalState(projectId);

    const hintMessage = buildStageHintMessage(toolType, stage, toolLabel);
    if (!hintMessage.trim()) {
      return;
    }

    const state = get();
    const projectHints = state.studioHintDedupeByProject[projectId] ?? {};
    if (projectHints[dedupeKey]) {
      return;
    }

    const projectMessages = state.localToolMessages[projectId] ?? {};
    const sessionMessages = projectMessages[sessionId] ?? [];
    const nextProjectMessages = {
      ...projectMessages,
      [sessionId]: [
        ...sessionMessages,
        createLocalMessage("assistant", hintMessage),
      ].slice(-120),
    };
    const nextProjectHints = {
      ...projectHints,
      [dedupeKey]: true as const,
    };

    set((prev) => ({
      localToolMessages: {
        ...prev.localToolMessages,
        [projectId]: nextProjectMessages,
      },
      studioHintDedupeByProject: {
        ...prev.studioHintDedupeByProject,
        [projectId]: nextProjectHints,
      },
    }));

    persistProjectLocalState(projectId, nextProjectMessages, nextProjectHints);
  };

  const enqueueRefineTask = async (task: () => Promise<void>) => {
    refinePendingCount += 1;
    if (!get().isStudioRefining) {
      set({ isStudioRefining: true });
    }

    refineQueue = refineQueue
      .then(task)
      .catch(() => {
        // Errors are handled in the task itself.
      })
      .finally(() => {
        refinePendingCount = Math.max(0, refinePendingCount - 1);
        if (refinePendingCount === 0) {
          set({ isStudioRefining: false });
        }
      });

    await refineQueue;
  };

  return {
    hydrateStudioLocalState: (projectId: string) => {
      if (!projectId) return;
      ensureProjectLocalState(projectId);
    },

    setStudioChatContext: (context) => {
      if (areStudioChatContextsEqual(get().studioChatContext, context)) {
        return;
      }
      set({ studioChatContext: context });
    },

    focusChatComposer: () => {
      set((state) => ({
        chatComposerFocusSignal: state.chatComposerFocusSignal + 1,
      }));
    },

    pushStudioHintMessage: (payload: StudioHintMessagePayload) => {
      pushHintMessage(payload);
    },

    fetchMessages: async (projectId: string, sessionId?: string | null) => {
      const requestId = ++latestFetchRequestId;
      set({ isMessagesLoading: true });
      try {
        const effectiveSessionId =
          sessionId ?? get().activeSessionId ?? undefined;
        if (!effectiveSessionId) {
          if (requestId === latestFetchRequestId) {
            set({ messages: [] });
          }
          return;
        }

        const response = await chatApi.getMessages({
          project_id: projectId,
          session_id: effectiveSessionId,
          limit: 50,
        });

        if (requestId === latestFetchRequestId) {
          set({ messages: response?.data?.messages ?? [] });
        }
      } catch (error) {
        if (requestId !== latestFetchRequestId) return;
        const message = getErrorMessage(error);
        toast({
          title: "获取消息失败",
          description: message,
          variant: "destructive",
        });
      } finally {
        if (requestId === latestFetchRequestId) {
          set({ isMessagesLoading: false });
        }
      }
    },

    sendMessage: async (
      projectId: string,
      content: string,
      sessionId?: string | null
    ) => {
      if (!content.trim()) return;
      const effectiveSessionId = sessionId ?? get().activeSessionId ?? null;
      if (!effectiveSessionId) {
        toast({
          title: "请先创建会话",
          description: "会话只能通过会话选择器中的“新建会话”创建。",
          variant: "destructive",
        });
        return;
      }

      set({ isSending: true, lastFailedInput: null });
      const tempId = `temp-${Date.now()}`;
      try {
        const userMessage: Message = {
          id: tempId,
          role: "user",
          content,
          timestamp: new Date().toISOString(),
        };
        set((state) => ({ messages: [...state.messages, userMessage] }));

        const {
          selectedFileIds,
          selectedLibraryIds,
          selectedArtifactSourceIds,
          files,
        } = get();
        const effectiveRagSourceIds = resolveReadySelectedFileIds(
          files,
          selectedFileIds
        );
        const effectiveSelectedSourceIds = Array.from(
          new Set([...effectiveRagSourceIds, ...selectedArtifactSourceIds])
        );
        const response = await chatApi.sendMessage({
          project_id: projectId,
          session_id: effectiveSessionId,
          content,
          selected_file_ids: effectiveSelectedSourceIds,
          rag_source_ids:
            effectiveSelectedSourceIds.length > 0
              ? effectiveSelectedSourceIds
              : undefined,
          selected_library_ids: selectedLibraryIds,
        });

        if (
          response?.data?.session_id &&
          response.data.session_id !== get().activeSessionId
        ) {
          set({ activeSessionId: response.data.session_id });
        }

        const responseData = (response?.data ?? {}) as Record<
          string,
          unknown
        > & {
          session_id?: string;
        };
        const sessionTitleUpdated = responseData.session_title_updated === true;
        const sessionTitle =
          typeof responseData.session_title === "string"
            ? responseData.session_title.trim()
            : "";
        if (
          sessionTitleUpdated &&
          sessionTitle &&
          typeof responseData.session_id === "string"
        ) {
          set((state) => ({
            generationHistory: state.generationHistory.map((item) =>
              item.id === responseData.session_id
                ? { ...item, title: sessionTitle }
                : item
            ),
          }));
        }

        await get().fetchGenerationHistory(projectId);

        if (response?.data?.message) {
          set((state) => ({
            messages: [
              ...state.messages.slice(0, -1),
              userMessage,
              response.data!.message!,
            ],
          }));
        }

        const refreshedSnapshot = await get().refreshGenerationSession(
          response?.data?.session_id ?? effectiveSessionId
        );

        const observability =
          responseData.observability &&
          typeof responseData.observability === "object"
            ? (responseData.observability as Record<string, unknown>)
            : null;
        const teachingBriefHint = (
          responseData.teaching_brief_hint || observability?.teaching_brief_hint
        ) as Record<string, any> | undefined;

        
        if (teachingBriefHint) {
          const refreshAfterMs =
            typeof teachingBriefHint.refresh_after_ms === "number"
              ? teachingBriefHint.refresh_after_ms
              : Number(teachingBriefHint.refresh_after_ms) || 3000;
          const generationAction = normalizeCoursewareGenerationAction(
            teachingBriefHint.generation_action
          );
          const generationDraftRaw =
            teachingBriefHint.generation_confirm_draft &&
            typeof teachingBriefHint.generation_confirm_draft === "object"
              ? (teachingBriefHint.generation_confirm_draft as Record<
                  string,
                  unknown
                >)
              : null;
          const actionSessionId = response?.data?.session_id ?? effectiveSessionId;
          const generationConfirmDraft: ChatGenerationConfirmDraft | null =
            actionSessionId &&
            generationDraftRaw &&
            typeof generationDraftRaw.summary === "string" &&
            typeof generationDraftRaw.prompt === "string" &&
            generationDraftRaw.config &&
            typeof generationDraftRaw.config === "object"
              ? {
                  sessionId: actionSessionId,
                  summary: generationDraftRaw.summary,
                  prompt: generationDraftRaw.prompt,
                  config: {
                    prompt:
                      typeof (
                        generationDraftRaw.config as Record<string, unknown>
                      ).prompt === "string"
                        ? String(
                            (
                              generationDraftRaw.config as Record<
                                string,
                                unknown
                              >
                            ).prompt
                          )
                        : "",
                    pageCount: Number(
                      (
                        generationDraftRaw.config as Record<string, unknown>
                      ).pageCount
                    ),
                    visualStyle:
                      typeof (
                        generationDraftRaw.config as Record<string, unknown>
                      ).visualStyle === "string"
                        ? String(
                            (
                              generationDraftRaw.config as Record<
                                string,
                                unknown
                              >
                            ).visualStyle
                          )
                        : "free",
                    layoutMode:
                      (generationDraftRaw.config as Record<string, unknown>)
                        .layoutMode === "classic"
                        ? "classic"
                        : "smart",
                    templateId:
                      typeof (
                        generationDraftRaw.config as Record<string, unknown>
                      ).templateId === "string"
                        ? String(
                            (
                              generationDraftRaw.config as Record<
                                string,
                                unknown
                              >
                            ).templateId
                          )
                        : null,
                    visualPolicy:
                      (generationDraftRaw.config as Record<string, unknown>)
                        .visualPolicy === "media_required"
                        ? "media_required"
                        : (generationDraftRaw.config as Record<string, unknown>)
                              .visualPolicy === "basic_graphics_only"
                          ? "basic_graphics_only"
                          : "auto",
                  },
                  sourceMessageIds: Array.isArray(generationDraftRaw.source_message_ids)
                    ? generationDraftRaw.source_message_ids
                        .map((value) => String(value || "").trim())
                        .filter(Boolean)
                    : [],
                }
              : null;
          set({
            latestBriefHint: {
              sessionId: actionSessionId,
              autoAppliedFields: teachingBriefHint.auto_applied_fields || [],
              missingFields: teachingBriefHint.missing_fields || [],
              status: teachingBriefHint.status || "live",
              briefSnapshot: teachingBriefHint.brief_snapshot || null,
              generationIntent: teachingBriefHint.generation_intent || false,
              generationReady: teachingBriefHint.generation_ready || false,
              generationBlockedReason: teachingBriefHint.generation_blocked_reason || "",
              generationAction,
              extractionScheduled: teachingBriefHint.extraction_scheduled === true,
              extractionReason:
                typeof teachingBriefHint.extraction_reason === "string"
                  ? teachingBriefHint.extraction_reason
                  : null,
              refreshAfterMs,
            },
          });

          if (actionSessionId) {
            get().setGenerationConfirmDraft(actionSessionId, generationConfirmDraft);
          }
        }

        const generationAction = normalizeCoursewareGenerationAction(
          teachingBriefHint?.generation_action
        );
        const shouldDelayedRefresh = !!(
          !generationAction &&
          (teachingBriefHint?.extraction_scheduled ||
            teachingBriefHint?.generation_intent ||
            (teachingBriefHint?.auto_applied_fields?.length > 0))
        );
        
        if (shouldDelayedRefresh) {
          const refreshDelayMs =
            typeof teachingBriefHint?.refresh_after_ms === "number"
              ? teachingBriefHint.refresh_after_ms
              : Number(teachingBriefHint?.refresh_after_ms) || 3000;
          const prevVersion =
            refreshedSnapshot?.teaching_brief?.version ??
            get().generationSession?.teaching_brief?.version ??
            0;
          setTimeout(() => {
            const sid = response?.data?.session_id ?? effectiveSessionId;
            if (sid) {
              void get().refreshGenerationSession(sid).then((snapshot) => {
                const newVersion = snapshot?.teaching_brief?.version ?? 0;
                if (newVersion > prevVersion) {
                  toast({
                    title: "需求单自动提取成功",
                    description: "AI 已从刚才的对话中自动提取并更新了教学需求。",
                  });
                }
              });
            }
          }, refreshDelayMs);
        }
      } catch (error) {
        const message = getChatRequestErrorMessage(error);
        set((state) => ({
          messages: state.messages.filter((m) => m.id !== tempId),
          lastFailedInput: content,
          error: createApiError({ code: "SEND_MESSAGE_FAILED", message }),
        }));
        toast({
          title: "发送消息失败",
          description: message,
          variant: "destructive",
        });
      } finally {
        set({ isSending: false });
      }
    },

    sendStudioRefineMessage: async (projectId: string, content: string) => {
      const normalizedContent = content.trim();
      if (!normalizedContent) return;

      const context = get().studioChatContext;
      const activeSessionId = get().activeSessionId;
      if (!context || context.projectId !== projectId) {
        toast({
          title: "当前不可微调",
          description: "请先进入工具卡片第 3 步预览态再发送微调指令。",
          variant: "destructive",
        });
        return;
      }

      if (
        !context.isRefineMode ||
        context.step !== "preview" ||
        !context.canRefine
      ) {
        toast({
          title: "当前不可微调",
          description: "请先进入工具卡片第 3 步预览态再发送微调指令。",
          variant: "destructive",
        });
        return;
      }

      const effectiveSessionId = context.sessionId || activeSessionId;
      if (!effectiveSessionId) {
        toast({
          title: "缺少会话上下文",
          description: "请先创建会话后再发送微调指令。",
          variant: "destructive",
        });
        return;
      }
      if (!context.targetArtifactId) {
        toast({
          title: "当前不可微调",
          description: "未定位到可微调的生成结果，请先完成一次生成后再试。",
          variant: "destructive",
        });
        return;
      }

      const initialRunId = context.targetRunId || null;
      const userRefineMessage = createLocalMessage("user", normalizedContent, {
        kind: "studio_refine_user",
        refineToolType: context.toolType,
        refineToolLabel: context.toolLabel,
        sessionId: effectiveSessionId,
        runId: initialRunId,
      });
      const refineStatusMessage = createLocalMessage(
        "assistant",
        buildRefineProcessingMessage(context.toolType, context.toolLabel),
        {
          kind: "studio_refine_status",
          refineStatus: "processing",
          refineToolType: context.toolType,
          refineToolLabel: context.toolLabel,
          sessionId: effectiveSessionId,
          runId: initialRunId,
        }
      );

      appendLocalMessage(projectId, effectiveSessionId, userRefineMessage);
      appendLocalMessage(projectId, effectiveSessionId, refineStatusMessage);

      const {
        selectedFileIds,
        selectedLibraryIds,
        selectedArtifactSourceIds,
        files,
      } = get();
      const effectiveRagSourceIds = resolveReadySelectedFileIds(
        files,
        selectedFileIds
      );
      const effectiveSelectedSourceIds = Array.from(
        new Set([...effectiveRagSourceIds, ...selectedArtifactSourceIds])
      );

      await enqueueRefineTask(async () => {
        try {
          const response = await studioCardsApi.refine(context.cardId, {
            project_id: projectId,
            session_id: effectiveSessionId,
            artifact_id: context.targetArtifactId || undefined,
            message: normalizedContent,
            refine_mode:
              context.cardId === "word_document"
                ? "structured_refine"
                : "chat_refine",
            source_artifact_id: context.sourceArtifactId || undefined,
            config: context.configSnapshot,
            selected_file_ids: effectiveSelectedSourceIds,
            rag_source_ids:
              effectiveSelectedSourceIds.length > 0
                ? effectiveSelectedSourceIds
                : undefined,
            selected_library_ids: selectedLibraryIds,
          });
          const executionResult =
            (response?.data as { execution_result?: Record<string, unknown> })
              ?.execution_result || null;
          const runPayload =
            executionResult &&
            typeof executionResult.run === "object" &&
            executionResult.run !== null
              ? (executionResult.run as Record<string, unknown>)
              : null;
          const artifactPayload =
            executionResult &&
            typeof executionResult.artifact === "object" &&
            executionResult.artifact !== null
              ? (executionResult.artifact as Record<string, unknown>)
              : null;
          const sessionPayload =
            executionResult &&
            typeof executionResult.session === "object" &&
            executionResult.session !== null
              ? (executionResult.session as Record<string, unknown>)
              : null;

          const refinedSessionId =
            (typeof sessionPayload?.session_id === "string" &&
              sessionPayload.session_id) ||
            (typeof sessionPayload?.id === "string" && sessionPayload.id) ||
            response?.data?.session_id ||
            effectiveSessionId;
          const refinedRunId =
            (typeof runPayload?.run_id === "string" && runPayload.run_id) ||
            (typeof runPayload?.id === "string" && runPayload.id) ||
            (response?.data as { run_id?: string } | undefined)?.run_id ||
            initialRunId;
          const refinedArtifactId =
            (typeof artifactPayload?.id === "string" && artifactPayload.id) ||
            (typeof artifactPayload?.artifact_id === "string" &&
              artifactPayload.artifact_id) ||
            (response?.data as { artifact_id?: string } | undefined)
              ?.artifact_id ||
            null;

          if (
            context.cardId === "knowledge_mindmap" &&
            !refinedArtifactId
          ) {
            throw new Error("未生成新版导图");
          }

          if (refinedSessionId !== get().activeSessionId) {
            set({ activeSessionId: refinedSessionId });
          }

          await get().fetchArtifactHistory(projectId, refinedSessionId);
          if (
            typeof window !== "undefined" &&
            context.toolType &&
            (refinedArtifactId || refinedRunId)
          ) {
            if (context.toolType === "quiz") {
              window.dispatchEvent(
                new CustomEvent("spectra:quiz:set-mode", {
                  detail: { mode: "browse" },
                })
              );
            }
            window.dispatchEvent(
              new CustomEvent("spectra:open-history-item", {
                detail: {
                  origin: "workflow",
                  toolType: context.toolType,
                  step: "preview",
                  status: "completed",
                  sessionId: refinedSessionId,
                  runId: refinedRunId,
                  artifactId: refinedArtifactId,
                },
              })
            );
          }

          updateLocalMessage(
            projectId,
            effectiveSessionId,
            refineStatusMessage.id,
            (message) => ({
              ...message,
              content: buildRefineSuccessMessage(
                context.toolType,
                context.toolLabel
              ),
              localMeta: {
                ...message.localMeta,
                kind: "studio_refine_status",
                refineStatus: "completed",
                refineToolType: context.toolType,
                refineToolLabel: context.toolLabel,
                sessionId: refinedSessionId,
                runId: refinedRunId,
                artifactId: refinedArtifactId,
              },
            })
          );
        } catch (error) {
          const message = getErrorMessage(error);
          const failureReason = readFailureReason(error);
          const failureDescription = buildRefineFailureMessage(
            context.toolType,
            context.toolLabel,
            failureReason
          );
          updateLocalMessage(
            projectId,
            effectiveSessionId,
            refineStatusMessage.id,
            (prevMessage) => ({
              ...prevMessage,
              content: failureDescription,
              localMeta: {
                ...prevMessage.localMeta,
                kind: "studio_refine_status",
                refineStatus: "failed",
                refineToolType: context.toolType,
                refineToolLabel: context.toolLabel,
                sessionId: effectiveSessionId,
                runId: initialRunId,
              },
            })
          );
          toast({
            title: "微调失败",
            description:
              failureReason &&
              (failureReason.includes("timeout") ||
                failureReason.includes("mindmap_refine_quality_low"))
                ? failureDescription
                : message,
            variant: "destructive",
          });
        }
      });
    },
  };
}
