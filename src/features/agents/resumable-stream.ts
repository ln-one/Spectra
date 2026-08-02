import "server-only";

import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from "assistant-stream/resumable";
import { createRedisResumableStreamStore } from "assistant-stream/resumable/redis";
import { createClient } from "redis";
import { type ServerEnvironment, serverEnvironment } from "@/environment/server";
import { webLogger } from "@/observability/server";

const streamTtlMs = 15 * 60 * 1_000;
const globalAgentStreams = globalThis as typeof globalThis & {
  spectraAgentStreamClient?: ReturnType<typeof createClient>;
  spectraAgentStreamConnection?: Promise<void>;
};

export function agentStreamEnvironment(environment: ServerEnvironment = serverEnvironment()) {
  if (!environment.REDIS_URL) throw new Error("REDIS_URL is required");
  return { url: environment.REDIS_URL };
}

async function connectedClient() {
  const { url } = agentStreamEnvironment();
  const client =
    globalAgentStreams.spectraAgentStreamClient ??
    createClient({
      socket: { reconnectStrategy: (retries) => Math.min(50 * 2 ** retries, 1_000) },
      url,
    });
  if (!globalAgentStreams.spectraAgentStreamClient) {
    client.on("error", (error) => {
      webLogger.error(
        { error, event: "agent.stream.redis_error" },
        "Agent resumable stream Redis error",
      );
    });
  }
  const connection =
    globalAgentStreams.spectraAgentStreamConnection ??
    (client.isOpen ? Promise.resolve() : client.connect().then(() => undefined));
  globalAgentStreams.spectraAgentStreamClient = client;
  globalAgentStreams.spectraAgentStreamConnection = connection;
  try {
    await connection;
  } catch (error) {
    if (globalAgentStreams.spectraAgentStreamConnection === connection) {
      delete globalAgentStreams.spectraAgentStreamConnection;
    }
    if (globalAgentStreams.spectraAgentStreamClient === client) {
      delete globalAgentStreams.spectraAgentStreamClient;
    }
    throw error;
  }
  return client;
}

export async function agentResumableStreamContext(
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<ResumableStreamContext> {
  const client = await connectedClient();
  return createResumableStreamContext({
    store: createRedisResumableStreamStore(client, {
      defaultTtlMs: streamTtlMs,
      keyPrefix: "spectra:agent-stream",
    }),
    ttlMs: streamTtlMs,
    ...(waitUntil ? { waitUntil } : {}),
  });
}
