import { parsePresentationProgressEvents } from "./progress";

export const PRESENTATION_AGENT_STALL_TIMEOUT_MS = 5 * 60_000;

function eventTimestamp(record: Record<string, unknown>) {
  if (typeof record.timestamp !== "string") return null;
  const value = record.timestamp;
  const timestamp = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function latestPresentationAgentActivityAt(events: readonly unknown[]) {
  const progressObservationIds = new Set(
    parsePresentationProgressEvents(events).map((item) => item.observationEventId),
  );
  let latestAt: number | null = null;
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const record = event as Record<string, unknown>;
    const isAgentEvent =
      record.source === "agent" && ["ActionEvent", "MessageEvent"].includes(String(record.kind));
    if (!isAgentEvent && !progressObservationIds.has(String(record.id))) continue;
    const timestamp = eventTimestamp(record);
    if (timestamp === null) continue;
    latestAt = Math.max(latestAt ?? timestamp, timestamp);
  }
  return latestAt;
}

export function presentationAgentStalled(lastActivityAt: number, now: number, status: string) {
  return status === "idle" && now - lastActivityAt >= PRESENTATION_AGENT_STALL_TIMEOUT_MS;
}
