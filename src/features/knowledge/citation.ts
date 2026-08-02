import type { PackedEvidenceUnit } from "./contracts";

export function validateEvidenceSelection(
  bundle: readonly PackedEvidenceUnit[],
  selectedIds: readonly string[],
) {
  const allowed = new Set(bundle.map((unit) => unit.id));
  const unique = new Set<string>();
  for (const id of selectedIds) {
    if (!allowed.has(id))
      return { valid: false as const, reason: "evidence_outside_bundle" as const };
    unique.add(id);
  }
  return { valid: true as const, evidence: bundle.filter((unit) => unique.has(unit.id)) };
}
