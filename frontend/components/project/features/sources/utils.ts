import type { UploadedFile } from "./types";

export function getFileTypeFromExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["mp4", "mov", "avi", "mkv", "webm", "flv", "wmv"].includes(ext))
    return "video";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext))
    return "image";
  if (["ppt", "pptx"].includes(ext)) return "ppt";
  if (["xls", "xlsx", "csv"].includes(ext)) return "excel";
  if (["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(ext)) return "audio";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  if (
    [
      "js",
      "ts",
      "jsx",
      "tsx",
      "py",
      "java",
      "cpp",
      "c",
      "go",
      "rs",
      "rb",
      "php",
      "swift",
      "kt",
    ].includes(ext)
  )
    return "code";
  if (ext === "txt") return "txt";
  return "other";
}

export function getFileStatusText(file: UploadedFile): string {
  if (
    file.status === "ready" &&
    file.parse_result?.indexed_count !== undefined
  ) {
    return `已索引 ${file.parse_result.indexed_count} 段`;
  }
  if (file.status === "ready") return "上传完成";
  if (file.status === "parsing") return "解析中";
  if (file.status === "uploading") return "上传中";
  if (file.parse_error) return `失败：${file.parse_error}`;
  return "解析失败";
}

export function getSourceTypeLabel(type?: string): string {
  if (type === "web") return "网页";
  if (type === "video") return "视频";
  if (type === "audio") return "音频";
  if (type === "ai_generated") return "AI";
  return "文档";
}

export function toSeconds(value?: string | number | null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function getUploadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "上传失败";
}

export function normalizeUploadingProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 5;
  return Math.max(5, Math.min(95, Math.round(progress)));
}
