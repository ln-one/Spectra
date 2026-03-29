import type { components as sdkComponents } from "@/lib/sdk/types";
import {
  groupArtifactsByTool,
  type ArtifactHistoryByTool,
  type ArtifactHistoryItem,
} from "@/lib/project-space";
import type { ApiErrorShape } from "@/lib/sdk/errors";

export type Project = sdkComponents["schemas"]["Project"];
export type UploadedFile = sdkComponents["schemas"]["UploadedFile"];
export type Message = sdkComponents["schemas"]["Message"];
export type OutlineDocument = sdkComponents["schemas"]["OutlineDocument"];
export type GenerationOptions = sdkComponents["schemas"]["GenerationOptions"];
export type SessionStatePayload =
  sdkComponents["schemas"]["SessionStatePayloadTarget"];

export interface SessionRun {
  run_id: string;
  session_id?: string | null;
  project_id?: string;
  tool_type?: string;
  run_no?: number;
  run_title?: string;
  run_title_source?: string;
  run_status?: string;
  run_step?: string;
  artifact_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}
export type SourceDetailResponse =
  sdkComponents["schemas"]["SourceDetailResponse"];
export type SourceDetail = SourceDetailResponse["data"];
export type Artifact = sdkComponents["schemas"]["Artifact"];

export type LayoutMode = "normal" | "expanded";
export type ExpandedTool =
  | "ppt"
  | "word"
  | "mindmap"
  | "outline"
  | "quiz"
  | "summary"
  | "animation"
  | "handout"
  | null;
export type StudioManagedTool = Exclude<ExpandedTool, "ppt" | null>;
export type StudioChatWorkflowStep = "config" | "generate" | "preview";

export interface StudioChatContext {
  projectId: string;
  sessionId: string;
  toolType: StudioManagedTool;
  toolLabel: string;
  cardId: string;
  step: StudioChatWorkflowStep;
  canRefine: boolean;
  isRefineMode: boolean;
  sourceArtifactId?: string | null;
  configSnapshot?: Record<string, unknown>;
}

export interface StudioHintMessagePayload {
  projectId: string;
  sessionId: string;
  toolType: StudioManagedTool;
  stage: "generate" | "preview";
  dedupeKey: string;
  toolLabel?: string;
}

export interface GenerationTool {
  id: string;
  name: string;
  description: string;
  icon: string;
  type:
    | "ppt"
    | "word"
    | "mindmap"
    | "outline"
    | "quiz"
    | "summary"
    | "animation"
    | "handout";
}

export interface GenerationHistory {
  id: string;
  toolId: string;
  toolName: string;
  status: "completed" | "failed" | "processing" | "pending";
  sessionState?: string;
  createdAt: string;
  title: string;
}

export interface ProjectState {
  project: Project | null;
  files: UploadedFile[];
  messages: Message[];
  selectedFileIds: string[];
  generationSession: SessionStatePayload | null;
  generationHistory: GenerationHistory[];
  artifactHistoryByTool: ArtifactHistoryByTool;
  currentSessionArtifacts: ArtifactHistoryItem[];
  localToolMessages: Record<string, Record<string, Message[]>>;
  studioHintDedupeByProject: Record<string, Record<string, true>>;
  studioChatContext: StudioChatContext | null;
  chatComposerFocusSignal: number;
  activeSessionId: string | null;
  activeRunId: string | null;
  lastFailedInput: string | null;
  activeSourceDetail: SourceDetail | null;

  layoutMode: LayoutMode;
  expandedTool: ExpandedTool;

  isLoading: boolean;
  isMessagesLoading: boolean;
  isSending: boolean;
  isStudioRefining: boolean;
  isUploading: boolean;
  uploadingCount: number;
  error: ApiErrorShape | null;

  fetchProject: (projectId: string) => Promise<void>;
  fetchFiles: (projectId: string) => Promise<void>;
  fetchMessages: (
    projectId: string,
    sessionId?: string | null
  ) => Promise<void>;
  uploadFile: (
    file: File,
    projectId: string,
    options?: { onProgress?: (progress: number) => void }
  ) => Promise<UploadedFile | void>;
  deleteFile: (fileId: string) => Promise<void>;
  toggleFileSelection: (fileId: string) => void;
  sendMessage: (
    projectId: string,
    content: string,
    sessionId?: string | null
  ) => Promise<void>;
  sendStudioRefineMessage: (
    projectId: string,
    content: string
  ) => Promise<void>;
  hydrateStudioLocalState: (projectId: string) => void;
  setStudioChatContext: (context: StudioChatContext | null) => void;
  pushStudioHintMessage: (payload: StudioHintMessagePayload) => void;
  focusChatComposer: () => void;
  focusSourceByChunk: (
    chunkId: string,
    projectId?: string | null
  ) => Promise<void>;
  clearActiveSource: () => void;
  startGeneration: (
    projectId: string,
    tool: GenerationTool,
    options?: GenerationOptions
  ) => Promise<string | null>;
  fetchGenerationHistory: (projectId: string) => Promise<void>;
  fetchArtifactHistory: (
    projectId: string,
    sessionId?: string | null
  ) => Promise<void>;
  exportArtifact: (artifactId: string) => Promise<void>;
  setActiveSessionId: (sessionId: string | null) => void;
  setActiveRunId: (runId: string | null) => void;
  updateOutline: (sessionId: string, outline: OutlineDocument) => Promise<void>;
  redraftOutline: (sessionId: string, instruction: string) => Promise<void>;
  confirmOutline: (sessionId: string) => Promise<void>;
  updateProjectName: (name: string) => Promise<void>;
  setLayoutMode: (mode: LayoutMode) => void;
  setExpandedTool: (tool: ExpandedTool) => void;
  clearLastFailedInput: () => void;
  reset: () => void;
}

export const GENERATION_TOOLS: GenerationTool[] = [
  {
    id: "ppt",
    name: "课件生成",
    description: "自动生成结构化课件页面与讲解节奏",
    icon: "📳",
    type: "ppt",
  },
  {
    id: "word",
    name: "文档生成",
    description: "输出教案、讲稿与课堂文档资料",
    icon: "📝",
    type: "word",
  },
  {
    id: "mindmap",
    name: "思维导图",
    description: "提炼知识结构与章节关系图谱",
    icon: "🧥",
    type: "mindmap",
  },
  {
    id: "outline",
    name: "互动游戏",
    description: "生成课堂互动游戏与规则流程",
    icon: "🎃",
    type: "outline",
  },
  {
    id: "quiz",
    name: "随堂小测",
    description: "快速生成课中测验题与答案解析",
    icon: "❂",
    type: "quiz",
  },
  {
    id: "summary",
    name: "说课助手",
    description: "生成讲解提示、追问建议与板书要点",
    icon: "🎗",
    type: "summary",
  },
  {
    id: "animation",
    name: "演示动画",
    description: "生成演示动效脚本与动画分镜建议",
    icon: "🎀",
    type: "animation",
  },
  {
    id: "handout",
    name: "学情预演",
    description: "预演课堂反馈与学生掌握情况变化",
    icon: "🎱",
    type: "handout",
  },
];

export const initialState = {
  project: null,
  files: [],
  messages: [],
  selectedFileIds: [],
  generationSession: null,
  generationHistory: [],
  artifactHistoryByTool: groupArtifactsByTool([]),
  currentSessionArtifacts: [],
  localToolMessages: {},
  studioHintDedupeByProject: {},
  studioChatContext: null as StudioChatContext | null,
  chatComposerFocusSignal: 0,
  activeSessionId: null as string | null,
  activeRunId: null as string | null,
  lastFailedInput: null as string | null,
  activeSourceDetail: null as SourceDetail | null,
  layoutMode: "normal" as LayoutMode,
  expandedTool: null as ExpandedTool,
  isLoading: false,
  isMessagesLoading: false,
  isSending: false,
  isStudioRefining: false,
  isUploading: false,
  uploadingCount: 0,
  error: null,
};

export type ProjectStoreContext = {
  set: (
    partial:
      | Partial<ProjectState>
      | ((state: ProjectState) => Partial<ProjectState>)
  ) => void;
  get: () => ProjectState;
};
