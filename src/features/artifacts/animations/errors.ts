export class AnimationError extends Error {
  constructor(
    readonly code:
      | "animation_not_found"
      | "animation_not_retryable"
      | "animation_runtime_unavailable",
  ) {
    super(code);
    this.name = "AnimationError";
  }
}
