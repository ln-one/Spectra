export type AnimationStep = "config" | "generate" | "preview";

export type AnimationScene = "particle_orbit" | "bubble_sort" | "magnetic_field";

export interface AnimationSceneOption {
  value: AnimationScene;
  label: string;
  description: string;
}
