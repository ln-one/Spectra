import type { ProjectStoreContext, ProjectState } from "./types";

export function createLayoutActions({ set }: ProjectStoreContext): Pick<
  ProjectState,
  "setLayoutMode" | "setExpandedTool" | "clearLastFailedInput"
> {
  return {
    setLayoutMode: (mode) => set({ layoutMode: mode }),
    setExpandedTool: (tool) => set({ expandedTool: tool }),
    clearLastFailedInput: () => set({ lastFailedInput: null }),
  };
}
