import { create } from "zustand";
import { createProjectActions } from "./project-store/project-actions";
import { createFileActions } from "./project-store/file-actions";
import { createChatActions } from "./project-store/chat-actions";
import { createGenerationActions } from "./project-store/generation-actions";
import { createLayoutActions } from "./project-store/layout-actions";
import {
  GENERATION_TOOLS,
  initialState,
  type ExpandedTool,
  type GenerationHistory,
  type GenerationTool,
  type LayoutMode,
  type ProjectState,
} from "./project-store/types";

export type {
  ExpandedTool,
  GenerationHistory,
  GenerationTool,
  LayoutMode,
  ProjectState,
};

export { GENERATION_TOOLS };

export const useProjectStore = create<ProjectState>()((set, get) => ({
  ...initialState,
  ...createProjectActions({ set, get }),
  ...createFileActions({ set, get }),
  ...createChatActions({ set, get }),
  ...createGenerationActions({ set, get }),
  ...createLayoutActions({ set, get }),
}));
