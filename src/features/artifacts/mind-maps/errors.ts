export class MindMapError extends Error {
  constructor(
    readonly code:
      | "mind_map_conflict"
      | "mind_map_not_found"
      | "mind_map_proposal_invalid"
      | "mind_map_proposal_stale",
  ) {
    super(code);
    this.name = "MindMapError";
  }
}
