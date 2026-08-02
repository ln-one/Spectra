export type TaskAgentRecipeVersion = "animation-remotion-v1" | "presentation-pptd-v1";

type TaskAgentRecipe = {
  defaultMaxDurationMs: number;
  outputDirectory: "out";
  pluginPath: string;
  recipeVersion: TaskAgentRecipeVersion;
  skill: "pptx" | "remotion";
  workspaceTemplatePath?: string;
};

export const taskAgentRecipes = {
  "animation-remotion-v1": {
    defaultMaxDurationMs: 45 * 60 * 1_000,
    outputDirectory: "out",
    pluginPath: "/opt/spectra/plugins/animation",
    recipeVersion: "animation-remotion-v1",
    skill: "remotion",
    workspaceTemplatePath: "/opt/spectra/templates/animation",
  },
  "presentation-pptd-v1": {
    defaultMaxDurationMs: 30 * 60 * 1_000,
    outputDirectory: "out",
    pluginPath: "/opt/spectra/plugins/presentation",
    recipeVersion: "presentation-pptd-v1",
    skill: "pptx",
  },
} as const satisfies Record<TaskAgentRecipeVersion, TaskAgentRecipe>;
