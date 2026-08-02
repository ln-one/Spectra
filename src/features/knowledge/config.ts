import { type ServerEnvironment, serverEnvironment } from "@/environment/server";

export function stratumindEnvironment(environment: ServerEnvironment = serverEnvironment()) {
  const url = new URL(environment.STRATUMIND_URL);
  const loopback =
    url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  if (!loopback && !environment.STRATUMIND_API_KEY) {
    throw new Error("STRATUMIND_API_KEY is required for non-loopback URLs");
  }
  return {
    apiKey: environment.STRATUMIND_API_KEY,
    collection: environment.STRATUMIND_COLLECTION,
    url: url.toString().replace(/\/$/, ""),
  };
}

export function knowledgeIndexingEnabled(environment: ServerEnvironment = serverEnvironment()) {
  return environment.KNOWLEDGE_INDEXING_ENABLED;
}

export function knowledgeEnvironment(environment: ServerEnvironment = serverEnvironment()) {
  if (!knowledgeIndexingEnabled(environment)) {
    return { indexingEnabled: false } as const;
  }
  if (!environment.DASHSCOPE_API_KEY || !environment.DASHSCOPE_BASE_URL) {
    throw new Error("DashScope configuration is required when knowledge indexing is enabled");
  }
  return {
    dashscope: {
      apiKey: environment.DASHSCOPE_API_KEY,
      baseUrl: environment.DASHSCOPE_BASE_URL,
    },
    embedding: {
      dimension: environment.KNOWLEDGE_EMBEDDING_DIMENSION,
      model: environment.KNOWLEDGE_EMBEDDING_MODEL,
    },
    indexingEnabled: true,
    rerank: {
      model: environment.KNOWLEDGE_RERANK_MODEL,
      timeoutMs: environment.KNOWLEDGE_RERANK_TIMEOUT_MS,
      url: environment.DASHSCOPE_RERANK_URL,
    },
    visualDescription: {
      model: environment.SPECTRA_VISUAL_DESCRIPTION_MODEL_ID,
      promptVersion: "visual-description-v1",
    },
    stratumind: stratumindEnvironment(environment),
  } as const;
}
