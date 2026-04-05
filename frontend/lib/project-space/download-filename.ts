const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g;
const MULTIPLE_SPACES = /\s+/g;

function replaceControlChars(value: string): string {
  let output = "";
  for (const ch of value) {
    output += ch.charCodeAt(0) < 32 ? " " : ch;
  }
  return output;
}

function sanitizeFilenameBase(value: string): string {
  const normalized = replaceControlChars(String(value || ""))
    .replace(ILLEGAL_FILENAME_CHARS, " ")
    .replace(MULTIPLE_SPACES, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return normalized.slice(0, 120);
}

export function inferArtifactDownloadExt(artifactType?: string | null): string {
  switch (artifactType) {
    case "pptx":
      return "pptx";
    case "docx":
      return "docx";
    case "html":
      return "html";
    case "gif":
      return "gif";
    case "mp4":
      return "mp4";
    case "mindmap":
      return "json";
    case "exercise":
      return "json";
    case "summary":
      return "json";
    default:
      return "bin";
  }
}

export function resolveArtifactTitleFromMetadata(
  metadata: unknown
): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const row = metadata as Record<string, unknown>;
  const title = row.title;
  if (typeof title === "string" && title.trim()) {
    return title.trim();
  }
  const name = row.name;
  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }
  return null;
}

export function buildArtifactDownloadFilename({
  title,
  artifactId,
  artifactType,
  ext,
}: {
  title?: string | null;
  artifactId?: string | null;
  artifactType?: string | null;
  ext?: string | null;
}): string {
  const fallbackId = String(artifactId || "artifact").slice(0, 8);
  const base = sanitizeFilenameBase(title || "") || `artifact-${fallbackId}`;
  const resolvedExt = (ext || inferArtifactDownloadExt(artifactType)).replace(
    /^\.+/,
    ""
  );
  return `${base}.${resolvedExt || "bin"}`;
}
