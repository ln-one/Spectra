import "server-only";

import { animationServerModule } from "./animations/server-module.server";
import { teachingDocumentServerModule } from "./documents/server-module.server";
import { gameServerModule } from "./games/server-module.server";
import { mindMapServerModule } from "./mind-maps/server-module.server";
import { presentationServerModule } from "./presentations/server-module.server";
import { quizServerModule } from "./quizzes/server-module.server";
import type { ArtifactServerModule } from "./server-contract.server";
import type { ArtifactKind } from "./types";

export type { ArtifactServerModule } from "./server-contract.server";

export const artifactServerModules = {
  animation: animationServerModule,
  teaching_document: teachingDocumentServerModule,
  mind_map: mindMapServerModule,
  quiz: quizServerModule,
  game: gameServerModule,
  presentation: presentationServerModule,
} satisfies { [Kind in ArtifactKind]: ArtifactServerModule<Kind> };

export function artifactServerModule<Kind extends ArtifactKind>(kind: Kind) {
  return artifactServerModules[kind];
}
