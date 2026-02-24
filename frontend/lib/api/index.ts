/**
 * API Module - Unified exports
 *
 * 所有 API 模块的统一导出
 */

export * from "./client";
export * from "./auth";
export * from "./projects";
export * from "./files";
export * from "./chat";
export * from "./generate";
export * from "./preview";
export * from "./rag";

export { authApi } from "./auth";
export { projectsApi } from "./projects";
export { filesApi } from "./files";
export { chatApi } from "./chat";
export { generateApi } from "./generate";
export { previewApi } from "./preview";
export { ragApi } from "./rag";

export type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  UserInfo,
} from "./auth";

export type {
  Project,
  CreateProjectRequest,
  GetProjectsResponse,
  GetProjectResponse,
  CreateProjectResponse,
} from "./projects";

export type {
  UploadedFile,
  UploadResponse,
  GetFilesResponse,
  UpdateFileIntentRequest,
  UpdateFileIntentResponse,
} from "./files";

export type {
  Message,
  SendMessageRequest,
  SendMessageResponse,
  GetMessagesResponse,
} from "./chat";

export type {
  GenerateRequest,
  GenerateResponse,
  GenerateStatusResponse,
} from "./generate";

export type { PreviewResponse, ModifyRequest, ModifyResponse } from "./preview";

export type {
  RAGSearchRequest,
  RAGSearchResponse,
  SourceDetailResponse,
} from "./rag";
