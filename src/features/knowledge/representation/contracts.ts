import type { SourceFileExtension } from "@/features/sources/validation";
import type { RepresentationFamily } from "../contracts";
import type { ProjectableBlock } from "../projection";

type MineruRepresentationMetadata = {
  kind: "mineru";
  providerOutputSchema: "content-list-v2";
  archiveHash: string;
  contentListHash: string;
  providerBackend?: string;
  providerVersion?: string;
};

export type CanonicalSourceRepresentation = {
  format: string;
  family: RepresentationFamily;
  adapterId: string;
  adapterVersion: "2" | "3";
  contentHash: string;
  metadata?: MineruRepresentationMetadata;
  blocks: ProjectableBlock[];
};

export type RepresentationAdapter = {
  parse(input: {
    format: SourceFileExtension;
    bytes: Uint8Array;
  }): Promise<CanonicalSourceRepresentation>;
};
