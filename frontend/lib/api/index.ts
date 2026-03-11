export * from "./client";
export * from "./auth";
export * from "./projects";
export * from "./files";
export * from "./chat";
export * from "./generate";
export * from "./preview";
export * from "./rag";
export * from "./health";

export { authApi } from "./auth";
export { projectsApi } from "./projects";
export { filesApi } from "./files";
export { chatApi } from "./chat";
export { generateApi } from "./generate";
export { previewApi } from "./preview";
export { ragApi } from "./rag";
export { healthApi } from "./health";

export type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  UserInfo,
} from "./auth";

export type {
  Project,
  ProjectRequest,
  GetProjectsResponse,
  ProjectResponse,
} from "./projects";

export type {
  UploadedFile,
  UploadResponse,
  GetFilesResponse,
  UpdateFileIntentRequest,
  UpdateFileIntentResponse,
} from "./files";

export type {
  PreviewResponse,
  ModifySessionRequest,
  ModifyResponse,
  SlideDetailResponse,
  ExportRequest,
  ExportResponse,
} from "./preview";

export type {
  RAGSearchRequest,
  RAGSearchResponse,
  SourceDetailResponse,
} from "./rag";
