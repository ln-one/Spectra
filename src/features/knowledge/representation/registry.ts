import { SOURCE_FORMAT_REGISTRY } from "@/features/sources/validation";
import type { RepresentationAdapter } from "./contracts";

const loaderByProvider = {
  mineru: async () => (await import("./adapters/mineru")).mineruContentRepresentationAdapter,
  media_understanding: async () =>
    (await import("./adapters/native-media")).nativeAndMediaRepresentationAdapter,
  native_text: async () =>
    (await import("./adapters/native-media")).nativeAndMediaRepresentationAdapter,
} as const;

type Provider = keyof typeof loaderByProvider;
const providerByAdapter = new Map<string, Provider>();
for (const policy of Object.values(SOURCE_FORMAT_REGISTRY)) {
  const registered = providerByAdapter.get(policy.adapter);
  if (registered && registered !== policy.provider) {
    throw new Error(`knowledge_adapter_registration_conflict:${policy.adapter}`);
  }
  providerByAdapter.set(policy.adapter, policy.provider);
}

const adapterCache = new Map<string, Promise<RepresentationAdapter>>();

export async function resolveRepresentationAdapter(adapterId: string) {
  const provider = providerByAdapter.get(adapterId);
  if (!provider) throw new Error(`knowledge_adapter_not_registered:${adapterId}`);
  const cached = adapterCache.get(adapterId);
  if (cached) return cached;
  const loaded = loaderByProvider[provider]();
  adapterCache.set(adapterId, loaded);
  return loaded;
}
