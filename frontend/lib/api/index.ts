export * from "./client";
export * from "./auth";
export * from "./projects";
export * from "./files";

export { authApi } from "./auth";
export { projectsApi } from "./projects";
export { filesApi } from "./files";

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
