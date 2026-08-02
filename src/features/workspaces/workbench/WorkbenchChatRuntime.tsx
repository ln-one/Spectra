"use client";

import {
  type AppendMessage,
  AssistantRuntimeProvider,
  AuiProvider,
  defineToolkit,
  Tools,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import {
  AssistantChatTransport,
  createResumableSessionStorage,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import type { CreateUIMessage, UIMessage, UIMessageChunk } from "ai";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ARTIFACT_AGENT_TOOL_IDS } from "@/features/agents/artifact-tool-protocol";
import { PLANNING_TOOL_IDS } from "@/features/agents/planning-tools";
import {
  type AgentSurfaceContext,
  agentSurfaceContextSchema,
} from "@/features/agents/surface-context";
import { type ThreadTitleUpdate, threadTitleUpdateSchema } from "@/features/agents/thread-events";
import {
  type ArtifactEditProposal,
  artifactEditProposalSchema,
} from "@/features/artifacts/proposal-contract";
import type { Locale } from "@/i18n/config";
import { createLocaleDictationAdapter, type DictationErrorKind } from "./dictation";
import { AskUserCard, SubmitPlanCard } from "./PlanningToolCards";

type DictationErrorContextValue = {
  clear: () => void;
  error: DictationErrorKind | null;
};

const DictationErrorContext = createContext<DictationErrorContextValue | null>(null);

type AgentRunControlContextValue = { cancel: (cancelRuntime: () => void) => void };
const AgentRunControlContext = createContext<AgentRunControlContextValue | null>(null);

export function useDictationError() {
  return useContext(DictationErrorContext);
}

export function useCancelAgentRun() {
  const context = useContext(AgentRunControlContext);
  if (!context) throw new Error("useCancelAgentRun must be used within WorkbenchChatRuntime");
  return context.cancel;
}

export type { ArtifactStreamEvent } from "@/features/artifacts/workbench-client";

export type ComposerSuggestion = { id: number; text: string };
export type UserMessageSurfaceSnapshot = { id: string; surface: AgentSurfaceContext };
export type WorkspaceMessageIntent = "chat" | "plan";

type RetrievalPreferenceMessage = {
  metadata?: UIMessage["metadata"];
  role?: UIMessage["role"];
};

function retrievalPreferenceFromMessage(
  candidate: RetrievalPreferenceMessage | undefined,
  key: string,
) {
  const metadata = candidate?.metadata;
  return Boolean(metadata && typeof metadata === "object" && Reflect.get(metadata, key) === true);
}

function intentFromMessage(candidate: UIMessage | undefined): WorkspaceMessageIntent {
  const metadata = candidate?.metadata;
  return metadata &&
    typeof metadata === "object" &&
    Reflect.get(metadata, "spectraIntent") === "plan"
    ? "plan"
    : "chat";
}

export function messageIntentFromMessages(messages: readonly UIMessage[]): WorkspaceMessageIntent {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return intentFromMessage(messages[index]);
  }
  return "chat";
}

function retrievalPreferenceFromMessages(
  messages: readonly RetrievalPreferenceMessage[],
  key: string,
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return retrievalPreferenceFromMessage(messages[index], key);
    }
  }
  return false;
}

export function workspaceRetrievalFromMessages(messages: readonly RetrievalPreferenceMessage[]) {
  return retrievalPreferenceFromMessages(messages, "spectraForceWorkspaceRetrieval");
}

export function webSearchFromMessages(messages: readonly RetrievalPreferenceMessage[]) {
  return retrievalPreferenceFromMessages(messages, "spectraForceWebSearch");
}

function surfaceContextFromMessage(candidate: UIMessage | undefined) {
  const metadata = candidate?.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const parsed = agentSurfaceContextSchema.safeParse(
    Reflect.get(metadata, "spectraSurfaceContext"),
  );
  return parsed.success ? parsed.data : null;
}

export function userMessageSurfaceSnapshots(messages: readonly UIMessage[]) {
  const snapshots = new Map<string, AgentSurfaceContext>();
  for (const message of messages) {
    if (message.role !== "user") continue;
    const surface = surfaceContextFromMessage(message);
    if (surface) snapshots.set(message.id, surface);
  }
  return snapshots;
}

export function surfaceForCreatedMessage(
  sourceId: string | null | undefined,
  currentSurface: AgentSurfaceContext,
  snapshots: ReadonlyMap<string, AgentSurfaceContext>,
) {
  return sourceId ? (snapshots.get(sourceId) ?? currentSurface) : currentSurface;
}

export function useAgentRunActivity() {
  return useAuiState((state) => state.thread.isRunning);
}

export function agentChatRequestBody({
  clientRequestId,
  conversationId,
  locale,
  messages,
  messageId,
  trigger,
  workspaceId,
  surfaceContext,
}: {
  clientRequestId?: string | undefined;
  conversationId: string;
  locale: Locale;
  messageId?: string | undefined;
  messages: UIMessage[];
  trigger: "regenerate-message" | "submit-message";
  workspaceId: string;
  surfaceContext: AgentSurfaceContext;
}) {
  let latestUserMessage: UIMessage | undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      latestUserMessage = messages[index];
      break;
    }
  }
  return {
    clientRequestId:
      clientRequestId ?? messageId ?? latestUserMessage?.id ?? globalThis.crypto.randomUUID(),
    conversationId,
    intent: intentFromMessage(latestUserMessage),
    locale,
    ...(messageId ? { messageId } : {}),
    messages,
    surface: surfaceContextFromMessage(latestUserMessage) ?? surfaceContext,
    trigger,
    workspaceId,
  };
}

export function agentRunCancellationUrl(input: {
  clientRequestId: string;
  conversationId: string;
  workspaceId: string;
}) {
  const query = new URLSearchParams(input);
  return `/api/agent/runs/by-request?${query.toString()}`;
}

export function workbenchCreateMessage<UI_MESSAGE extends UIMessage = UIMessage>(
  message: AppendMessage,
  surfaceContext: AgentSurfaceContext = { type: "studio" },
  messageId = globalThis.crypto.randomUUID(),
  intent: WorkspaceMessageIntent = "chat",
  retrievalPreferences: { web: boolean; workspace: boolean } = { web: false, workspace: false },
): CreateUIMessage<UI_MESSAGE> {
  if (message.role !== "user") throw new Error("Workbench composer only accepts user messages");
  if (message.attachments && message.attachments.length > 0) {
    throw new Error("Workbench message attachments are not configured");
  }
  const parts = message.content.map((part) => {
    if (part.type !== "text") throw new Error("Workbench composer only accepts text content");
    return { text: part.text, type: "text" as const };
  });
  const requestedIntent = Reflect.get(message.metadata.custom, "spectraIntent");
  const resolvedIntent =
    requestedIntent === "chat" || requestedIntent === "plan" ? requestedIntent : intent;
  return {
    id: messageId,
    metadata: {
      spectraSurfaceContext: surfaceContext,
      ...(resolvedIntent === "plan" ? { spectraIntent: "plan" } : {}),
      ...(retrievalPreferences.workspace ? { spectraForceWorkspaceRetrieval: true } : {}),
      ...(retrievalPreferences.web ? { spectraForceWebSearch: true } : {}),
    },
    parts,
    role: "user",
  } as CreateUIMessage<UI_MESSAGE>;
}

function WorkspaceAgentToolRegistry({
  children,
  onPlanningFinished,
}: {
  children: ReactNode;
  onPlanningFinished?: (() => void) | undefined;
}) {
  const aui = useAui({
    tools: Tools({
      toolkit: defineToolkit({
        [ARTIFACT_AGENT_TOOL_IDS.commitArtifactPlan]: {
          render: () => null,
        },
        [PLANNING_TOOL_IDS.askUser]: {
          render: (props) => <AskUserCard {...props} onPlanningFinished={onPlanningFinished} />,
        },
        [PLANNING_TOOL_IDS.submitPlan]: {
          render: (props) => <SubmitPlanCard {...props} onPlanningFinished={onPlanningFinished} />,
        },
      }),
    }),
  });
  return <AuiProvider value={aui}>{children}</AuiProvider>;
}

function ChatRuntimeBoundary({
  conversationId,
  locale,
  messages,
  workspaceId,
  children,
  onThreadTitle,
  onArtifactProposal,
  onUserMessageCreated,
  surfaceContext,
  composerSuggestion,
  onComposerSuggestionConsumed,
  messageIntent,
  forceWorkspaceRetrieval,
  forceWebSearch,
  onPlanningFinished,
}: {
  surfaceContext: AgentSurfaceContext;
  composerSuggestion?: ComposerSuggestion | null | undefined;
  messageIntent: WorkspaceMessageIntent;
  forceWorkspaceRetrieval: boolean;
  forceWebSearch: boolean;
  onPlanningFinished?: (() => void) | undefined;
  onComposerSuggestionConsumed?: ((id: number) => void) | undefined;
  conversationId: string;
  locale: Locale;
  messages: readonly UIMessage[];
  workspaceId: string;
  children: ReactNode;
  onThreadTitle?: ((update: ThreadTitleUpdate) => void) | undefined;
  onArtifactProposal?: ((proposal: ArtifactEditProposal) => void) | undefined;
  onUserMessageCreated?: ((snapshot: UserMessageSurfaceSnapshot) => void) | undefined;
}) {
  const surfaceContextRef = useRef(surfaceContext);
  surfaceContextRef.current = surfaceContext;
  const activeClientRequestIdRef = useRef<string | null>(null);
  const messageIntentRef = useRef(messageIntent);
  messageIntentRef.current = messageIntent;
  const retrievalPreferencesRef = useRef({
    web: forceWebSearch,
    workspace: forceWorkspaceRetrieval,
  });
  retrievalPreferencesRef.current = {
    web: forceWebSearch,
    workspace: forceWorkspaceRetrieval,
  };
  const surfaceSnapshotsRef = useRef(new Map<string, AgentSurfaceContext>());
  const [initialMessages] = useState(() => [...messages]);
  const [dictationError, setDictationError] = useState<DictationErrorKind | null>(null);
  const dictation = useMemo(
    () =>
      createLocaleDictationAdapter(locale, {
        onError: setDictationError,
        onStart: () => setDictationError(null),
      }),
    [locale],
  );
  const transport = useMemo(
    () =>
      new AssistantChatTransport<UIMessage>({
        api: "/api/agent/chat",
        resumable: {
          storage: createResumableSessionStorage({
            key: `spectra:chat-stream:${workspaceId}:${conversationId}`,
          }),
          resumeApi: () => {
            const query = new URLSearchParams({ workspaceId });
            return `/api/agent/chat/${conversationId}/stream?${query}`;
          },
        },
        prepareSendMessagesRequest: ({ messages, messageId, trigger }) => {
          const body = agentChatRequestBody({
            clientRequestId:
              trigger === "regenerate-message" ? globalThis.crypto.randomUUID() : undefined,
            conversationId,
            locale,
            messageId,
            messages,
            surfaceContext: surfaceContextRef.current,
            trigger,
            workspaceId,
          });
          activeClientRequestIdRef.current = body.clientRequestId;
          return { body };
        },
      }),
    [conversationId, locale, workspaceId],
  );
  const onData = useCallback(
    (part: UIMessageChunk) => {
      if (part.type === "data-threadTitle") {
        const update = threadTitleUpdateSchema.safeParse(part.data);
        if (update.success && update.data.conversationId === conversationId) {
          onThreadTitle?.(update.data);
        }
      }
      if (
        part.type === "data-teachingDocumentEditProposed" ||
        part.type === "data-mindMapEditProposed" ||
        part.type === "data-quizEditProposed"
      ) {
        const proposal = artifactEditProposalSchema.safeParse(part.data);
        const expectedKind =
          part.type === "data-teachingDocumentEditProposed"
            ? "teaching_document"
            : part.type === "data-mindMapEditProposed"
              ? "mind_map"
              : "quiz";
        if (proposal.success && proposal.data.kind === expectedKind) {
          onArtifactProposal?.(proposal.data);
        }
      }
    },
    [conversationId, onArtifactProposal, onThreadTitle],
  );
  const toCreateMessage = useMemo(
    () =>
      <UI_MESSAGE extends UIMessage = UIMessage>(
        message: AppendMessage,
      ): CreateUIMessage<UI_MESSAGE> => {
        const id = globalThis.crypto.randomUUID();
        activeClientRequestIdRef.current = id;
        const snapshot = surfaceForCreatedMessage(
          message.sourceId,
          surfaceContextRef.current,
          surfaceSnapshotsRef.current,
        );
        surfaceSnapshotsRef.current.set(id, snapshot);
        onUserMessageCreated?.({ id, surface: snapshot });
        return workbenchCreateMessage<UI_MESSAGE>(
          message,
          snapshot,
          id,
          messageIntentRef.current,
          retrievalPreferencesRef.current,
        );
      },
    [onUserMessageCreated],
  );
  const runtime = useChatRuntime<UIMessage>({
    adapters: { dictation },
    messages: initialMessages,
    onData,
    toCreateMessage,
    transport,
  });
  const cancelAgentRun = useCallback(
    (cancelRuntime: () => void) => {
      const clientRequestId = activeClientRequestIdRef.current;
      activeClientRequestIdRef.current = null;
      cancelRuntime();
      if (!clientRequestId) return;

      void fetch(agentRunCancellationUrl({ clientRequestId, conversationId, workspaceId }), {
        credentials: "same-origin",
        keepalive: true,
        method: "DELETE",
      }).catch(() => undefined);
    },
    [conversationId, workspaceId],
  );
  const agentRunControl = useMemo(() => ({ cancel: cancelAgentRun }), [cancelAgentRun]);

  return (
    <DictationErrorContext.Provider
      value={{ clear: () => setDictationError(null), error: dictationError }}
    >
      <AgentRunControlContext.Provider value={agentRunControl}>
        <AssistantRuntimeProvider runtime={runtime}>
          <WorkspaceAgentToolRegistry onPlanningFinished={onPlanningFinished}>
            <ComposerSuggestionBridge
              suggestion={composerSuggestion ?? null}
              onConsumed={onComposerSuggestionConsumed}
            />
            {children}
          </WorkspaceAgentToolRegistry>
        </AssistantRuntimeProvider>
      </AgentRunControlContext.Provider>
    </DictationErrorContext.Provider>
  );
}

export function ComposerSuggestionBridge({
  suggestion,
  onConsumed,
}: {
  suggestion: ComposerSuggestion | null;
  onConsumed?: ((id: number) => void) | undefined;
}) {
  const aui = useAui();
  useEffect(() => {
    if (!suggestion) return;
    aui.composer().setText(suggestion.text);
    onConsumed?.(suggestion.id);
  }, [aui, onConsumed, suggestion]);
  return null;
}

export function WorkbenchChatRuntime({
  conversationId,
  locale,
  messages,
  workspaceId,
  children,
  onThreadTitle,
  onArtifactProposal,
  onUserMessageCreated,
  surfaceContext,
  composerSuggestion,
  onComposerSuggestionConsumed,
  messageIntent = "chat",
  forceWorkspaceRetrieval = false,
  forceWebSearch = false,
  onPlanningFinished,
}: {
  surfaceContext: AgentSurfaceContext;
  composerSuggestion?: ComposerSuggestion | null | undefined;
  messageIntent?: WorkspaceMessageIntent | undefined;
  forceWorkspaceRetrieval?: boolean | undefined;
  forceWebSearch?: boolean | undefined;
  onPlanningFinished?: (() => void) | undefined;
  onComposerSuggestionConsumed?: ((id: number) => void) | undefined;
  conversationId: string;
  locale: Locale;
  messages: readonly UIMessage[];
  workspaceId: string;
  children: ReactNode;
  onThreadTitle?: ((update: ThreadTitleUpdate) => void) | undefined;
  onArtifactProposal?: ((proposal: ArtifactEditProposal) => void) | undefined;
  onUserMessageCreated?: ((snapshot: UserMessageSurfaceSnapshot) => void) | undefined;
}) {
  return (
    <ChatRuntimeBoundary
      conversationId={conversationId}
      locale={locale}
      messages={messages}
      workspaceId={workspaceId}
      surfaceContext={surfaceContext}
      onUserMessageCreated={onUserMessageCreated}
      composerSuggestion={composerSuggestion}
      messageIntent={messageIntent}
      forceWorkspaceRetrieval={forceWorkspaceRetrieval}
      forceWebSearch={forceWebSearch}
      onPlanningFinished={onPlanningFinished}
      onComposerSuggestionConsumed={onComposerSuggestionConsumed}
      {...(onThreadTitle ? { onThreadTitle } : {})}
      {...(onArtifactProposal ? { onArtifactProposal } : {})}
    >
      {children}
    </ChatRuntimeBoundary>
  );
}
