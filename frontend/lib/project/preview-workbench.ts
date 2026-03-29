export type PreviewMode =
  | "loading"
  | "artifact_ready"
  | "blocked"
  | "text_fallback"
  | "empty";

export type EditQueueStatus =
  | "submitted"
  | "processing"
  | "success"
  | "failed"
  | "conflict";

export interface EditQueueItem {
  id: string;
  slideId: string | null;
  slideIndex: number;
  instruction: string;
  status: EditQueueStatus;
  message: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvePreviewModeInput {
  isLoading: boolean;
  hasArtifact: boolean;
  hasSlides: boolean;
  blockedReason: string | null;
}

export function resolvePreviewMode(input: ResolvePreviewModeInput): PreviewMode {
  if (input.isLoading) return "loading";
  if (input.hasArtifact) return "artifact_ready";
  if (input.blockedReason) return "blocked";
  if (input.hasSlides) return "text_fallback";
  return "empty";
}

export function buildArtifactDownloadUrl(
  projectId: string,
  artifactId: string
): string {
  return `/api/v1/projects/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifactId)}/download`;
}

export function supportsImagePatchFromEnv(
  envValue: string | undefined = process.env.NEXT_PUBLIC_ENABLE_PPT_IMAGE_PATCH
): boolean {
  return envValue === "true";
}

function matchesQueueItem(
  item: EditQueueItem,
  target: { slideId?: string | null; slideIndex?: number }
): boolean {
  if (target.slideId && item.slideId === target.slideId) return true;
  if (typeof target.slideIndex === "number" && item.slideIndex === target.slideIndex)
    return true;
  return false;
}

export function patchLatestQueueItem(
  queue: EditQueueItem[],
  target: { slideId?: string | null; slideIndex?: number },
  patch: Partial<EditQueueItem>
): EditQueueItem[] {
  const next = [...queue];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const item = next[index];
    if (!matchesQueueItem(item, target)) continue;
    next[index] = {
      ...item,
      ...patch,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    };
    return next;
  }
  return queue;
}
