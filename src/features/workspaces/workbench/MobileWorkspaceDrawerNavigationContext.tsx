"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

type MobileWorkspaceDrawerNavigationState = {
  beginWorkspaceNavigation: (workspaceId: string) => void;
  cancelWorkspaceNavigation: () => void;
  isOpen: boolean;
  navigationTargetWorkspaceId: string | null;
  setOpen: (open: boolean) => void;
};

const MobileWorkspaceDrawerNavigationContext =
  createContext<MobileWorkspaceDrawerNavigationState | null>(null);

export function MobileWorkspaceDrawerNavigationProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [navigationTargetWorkspaceId, setNavigationTargetWorkspaceId] = useState<string | null>(
    null,
  );
  const beginWorkspaceNavigation = useCallback((workspaceId: string) => {
    setOpen(true);
    setNavigationTargetWorkspaceId(workspaceId);
  }, []);
  const cancelWorkspaceNavigation = useCallback(() => {
    setNavigationTargetWorkspaceId(null);
  }, []);
  const value = useMemo(
    () => ({
      beginWorkspaceNavigation,
      cancelWorkspaceNavigation,
      isOpen,
      navigationTargetWorkspaceId,
      setOpen,
    }),
    [beginWorkspaceNavigation, cancelWorkspaceNavigation, isOpen, navigationTargetWorkspaceId],
  );

  return (
    <MobileWorkspaceDrawerNavigationContext.Provider value={value}>
      {children}
    </MobileWorkspaceDrawerNavigationContext.Provider>
  );
}

export function useMobileWorkspaceDrawerNavigation() {
  return useContext(MobileWorkspaceDrawerNavigationContext);
}
