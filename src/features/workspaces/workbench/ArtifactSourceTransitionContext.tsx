"use client";

import { createContext, useContext } from "react";

export type ArtifactSourceTransitionContextValue = {
  activeArtifactId: string | null;
  open: (input: {
    artifactId: string;
    conversationId: string;
    href: string;
    sourceElement: HTMLElement;
  }) => Promise<void>;
  prefetch: (input: { artifactId: string; conversationId: string }) => Promise<void>;
  run: (
    artifactId: string,
    destination: "history" | "sources",
    update: () => void,
  ) => Promise<void>;
};

const ArtifactSourceTransitionContext = createContext<ArtifactSourceTransitionContextValue | null>(
  null,
);

export const ArtifactSourceTransitionProvider = ArtifactSourceTransitionContext.Provider;

export function useArtifactSourceTransition() {
  return useContext(ArtifactSourceTransitionContext);
}
