import type { EvidenceContent, RepresentationFamily } from "../contracts";
import { knowledgeStructuredContentHash } from "../integrity";
import type { ProjectableBlock } from "../projection";
import type { CanonicalSourceRepresentation } from "./contracts";

export function representation(
  format: string,
  family: RepresentationFamily,
  adapterId: string,
  blocks: ProjectableBlock[],
  options: Pick<CanonicalSourceRepresentation, "adapterVersion" | "metadata"> = {
    adapterVersion: "2",
  },
): CanonicalSourceRepresentation {
  if (blocks.length === 0) throw new Error("knowledge_source_result_empty");
  return {
    format,
    family,
    adapterId,
    adapterVersion: options.adapterVersion,
    contentHash: knowledgeStructuredContentHash(blocks),
    ...(options.metadata ? { metadata: options.metadata } : {}),
    blocks,
  };
}

export function tableContent(
  cells: Array<{
    address: string;
    value: string;
    displayValue?: string | undefined;
    formula?: string | undefined;
    rowSpan?: number | undefined;
    colSpan?: number | undefined;
  }>,
): EvidenceContent {
  return { kind: "table_cells", cells };
}

export function spreadsheetColumn(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}
