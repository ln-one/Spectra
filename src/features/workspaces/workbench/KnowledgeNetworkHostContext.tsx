"use client";

import { createContext, type ReactNode, useContext } from "react";

export type KnowledgeNetworkHost = {
  active: boolean;
  label: string;
  open: () => void;
};

const KnowledgeNetworkHostContext = createContext<KnowledgeNetworkHost | null>(null);

export function KnowledgeNetworkHostProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: KnowledgeNetworkHost | null;
}) {
  return (
    <KnowledgeNetworkHostContext.Provider value={value}>
      {children}
    </KnowledgeNetworkHostContext.Provider>
  );
}

export function useKnowledgeNetworkHost() {
  return useContext(KnowledgeNetworkHostContext);
}
