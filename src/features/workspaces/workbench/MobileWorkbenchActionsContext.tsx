"use client";

import { createContext, type ReactNode, useContext } from "react";

type MobileWorkbenchActions = {
  openSources: () => void;
  openStudio: () => void;
};

const MobileWorkbenchActionsContext = createContext<MobileWorkbenchActions | null>(null);

export function MobileWorkbenchActionsProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: MobileWorkbenchActions;
}) {
  return (
    <MobileWorkbenchActionsContext.Provider value={value}>
      {children}
    </MobileWorkbenchActionsContext.Provider>
  );
}

export function useMobileWorkbenchActions() {
  return useContext(MobileWorkbenchActionsContext);
}
