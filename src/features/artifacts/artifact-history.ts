import type { ArtifactHistoryItem } from "./types";

function compareArtifactHistory(
  left: Pick<ArtifactHistoryItem, "id" | "updatedAt">,
  right: Pick<ArtifactHistoryItem, "id" | "updatedAt">,
) {
  const updatedDifference = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  return updatedDifference || left.id.localeCompare(right.id);
}

export function sortArtifactHistory<T extends Pick<ArtifactHistoryItem, "id" | "updatedAt">>(
  history: readonly T[],
) {
  return [...history].sort(compareArtifactHistory);
}

export function formatArtifactHistoryTimestamp(value: string, locale: string, now = new Date()) {
  const date = new Date(value);
  return new Intl.DateTimeFormat(locale, {
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" as const }),
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(date);
}
