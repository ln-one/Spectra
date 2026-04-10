import type { UploadedFile } from "./types";

export function resolveReadySelectedFileIds(
  files: UploadedFile[],
  selectedFileIds: string[]
): string[] {
  if (!selectedFileIds.length || !files.length) {
    return [];
  }

  const readyFileIds = new Set(
    files
      .filter((file) => file.status === "ready")
      .map((file) => String(file.id || "").trim())
      .filter(Boolean)
  );

  return selectedFileIds.filter((fileId) => readyFileIds.has(fileId));
}
