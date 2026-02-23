/**
 * API Module - Unified exports
 */

export * from "./client";
export * from "./auth";
export * from "./projects";
export * from "./files";

// Re-export for convenience
export { authApi } from "./auth";
export { projectsApi } from "./projects";
export { filesApi } from "./files";
