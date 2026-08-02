import "server-only";

import {
  requireSourceFormatCapabilities,
  SOURCE_FORMAT_REGISTRY,
  type SourceFileExtension,
  type SourceIngestionProvider,
} from "@/features/sources/validation";
import type { CanonicalSourceRepresentation } from "./representation/contracts";
import { resolveRepresentationAdapter } from "./representation/registry";

export type { CanonicalSourceRepresentation } from "./representation/contracts";

export async function canonicalSourceRepresentation(input: {
  provider: SourceIngestionProvider;
  format: SourceFileExtension;
  bytes: Uint8Array;
}): Promise<CanonicalSourceRepresentation> {
  const policy = SOURCE_FORMAT_REGISTRY[input.format];
  if (policy.provider !== input.provider) {
    throw new Error("knowledge_source_provider_mismatch");
  }
  requireSourceFormatCapabilities(input.format, ["project", "retrieve", "nativeLocator"]);
  const adapter = await resolveRepresentationAdapter(policy.adapter);
  const result = await adapter.parse({
    format: input.format,
    bytes: input.bytes,
  });
  if (result.format !== input.format) throw new Error("knowledge_source_format_mismatch");
  if (result.adapterId !== policy.adapter) {
    throw new Error("knowledge_source_adapter_mismatch");
  }
  if (policy.family !== "image") return result;
  // Standalone uploads are more faithful than a provider-produced preview inside the archive.
  // Keep MinerU's description and locator, but resolve pixels from the immutable source object.
  return {
    ...result,
    blocks: result.blocks.map((block) =>
      block.content?.kind === "visual_region"
        ? {
            ...block,
            content: { ...block.content, asset: { kind: "source_original" as const } },
          }
        : block,
    ),
  };
}
