import "server-only";

import type { Database } from "@/database/client";
import type { Actor } from "@/features/identity/types";
import type { ArtifactContracts, ArtifactDetailFor } from "./contract";
import type { ArtifactGroundingBundle } from "./grounding";
import type { ArtifactKind } from "./types";

export type ArtifactCreationInput<Kind extends ArtifactKind = ArtifactKind> =
  ArtifactContracts[Kind]["create"] & {
    actor: Actor;
    grounding?: ArtifactGroundingBundle;
  };

type ArtifactLookupInput = {
  artifactId: string;
  conversationId: string;
  workspaceId: string;
};

export type ArtifactServerModule<Kind extends ArtifactKind> = {
  cancelGeneration?: (attemptId: string) => Promise<void>;
  createFromAgent: (input: ArtifactCreationInput<Kind>) => Promise<ArtifactDetailFor<Kind>>;
  delete: (actor: Actor, input: ArtifactLookupInput, db?: Database) => Promise<void>;
  getDetail: (
    actor: Actor,
    input: ArtifactLookupInput,
    db?: Database,
  ) => Promise<ArtifactDetailFor<Kind>>;
  isNotFoundError: (error: unknown) => boolean;
  kind: Kind;
  purge: (artifactId: string, db?: Database) => Promise<void>;
};
