"use client";

import { createContext, type ReactNode, useContext } from "react";

export type SourcePanelFocusRequest = {
  id: string;
  sequence: number;
};

export type SourcePanelControls = {
  collapse: () => void;
  collapsed: boolean;
  expand: () => void;
  focusRequest: SourcePanelFocusRequest | null;
  showSource: (sourceId: string) => void;
};

const SourcePanelLayoutContext = createContext<SourcePanelControls | null>(null);

export function SourcePanelLayoutProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: SourcePanelControls;
}) {
  return (
    <SourcePanelLayoutContext.Provider value={value}>{children}</SourcePanelLayoutContext.Provider>
  );
}

export function useSourcePanelLayout() {
  return useContext(SourcePanelLayoutContext);
}
