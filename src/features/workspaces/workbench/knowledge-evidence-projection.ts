import type { Link, Parent, RootContent } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import {
  type KnowledgeCitationEvidence,
  parseKnowledgeEvidenceHref,
} from "@/features/agents/knowledge-citation-contract";
import { trustedKnowledgeCitationRemarkPlugin } from "./trusted-knowledge-citation-markdown";

export function knowledgeCitationTokensInMarkdown(
  markdown: string,
  evidence: readonly KnowledgeCitationEvidence[],
) {
  const processor = unified().use(remarkParse).use(trustedKnowledgeCitationRemarkPlugin(evidence));
  const tree = processor.runSync(processor.parse(markdown));
  const tokens: string[] = [];
  const visit = (parent: Parent) => {
    for (const child of parent.children as RootContent[]) {
      if (child.type === "link") {
        const token = parseKnowledgeEvidenceHref((child as Link).url);
        if (token) tokens.push(token);
      }
      if ("children" in child) visit(child as Parent);
    }
  };
  visit(tree);
  return tokens;
}

function explicitKnowledgeCitationTokensInMarkdown(
  markdown: string,
  evidence: readonly KnowledgeCitationEvidence[],
) {
  const trustedTokens = new Set(evidence.map((unit) => unit.citationToken));
  const tree = unified().use(remarkParse).parse(markdown);
  const tokens: string[] = [];
  const visit = (parent: Parent) => {
    for (const child of parent.children as RootContent[]) {
      if (child.type === "link") {
        const token = parseKnowledgeEvidenceHref((child as Link).url);
        if (token && trustedTokens.has(token)) tokens.push(token);
      }
      if ("children" in child) visit(child as Parent);
    }
  };
  visit(tree);
  return tokens;
}

export function knowledgeCitationDisplayNumbers(
  parts: readonly unknown[],
  evidence: readonly KnowledgeCitationEvidence[],
) {
  const trustedTokens = new Set(evidence.map((unit) => unit.citationToken));
  const displayNumbers = new Map<string, number>();
  for (const part of parts) {
    if (!part || typeof part !== "object" || Reflect.get(part, "type") !== "text") continue;
    const markdown = Reflect.get(part, "text");
    if (typeof markdown !== "string") continue;
    for (const citationToken of knowledgeCitationTokensInMarkdown(markdown, evidence)) {
      if (!trustedTokens.has(citationToken) || displayNumbers.has(citationToken)) continue;
      displayNumbers.set(citationToken, displayNumbers.size + 1);
    }
  }
  return displayNumbers;
}

export function knowledgeVisualEvidencePlacement(
  parts: readonly unknown[],
  evidence: readonly KnowledgeCitationEvidence[],
  visualEvidence: readonly KnowledgeCitationEvidence[],
  visibleTextPartIndexes: ReadonlySet<number>,
  _isStreaming = false,
) {
  const visualEvidenceByToken = new Map(visualEvidence.map((unit) => [unit.citationToken, unit]));
  const anchoredTokens = new Set<string>();
  const tokensByPartIndex = new Map<number, readonly string[]>();
  for (const [partIndex, part] of parts.entries()) {
    if (
      !visibleTextPartIndexes.has(partIndex) ||
      typeof part !== "object" ||
      part === null ||
      Reflect.get(part, "type") !== "text"
    ) {
      continue;
    }
    const markdown = Reflect.get(part, "text");
    if (typeof markdown !== "string") continue;
    const tokens: string[] = [];
    const citationTokens = explicitKnowledgeCitationTokensInMarkdown(markdown, evidence);
    for (const citationToken of citationTokens) {
      if (!visualEvidenceByToken.has(citationToken) || anchoredTokens.has(citationToken)) continue;
      anchoredTokens.add(citationToken);
      tokens.push(citationToken);
    }
    if (tokens.length === 0) continue;
    tokensByPartIndex.set(partIndex, tokens);
  }
  return {
    tokensByPartIndex,
    unanchoredVisualEvidence: visualEvidence.filter(
      (unit) => !anchoredTokens.has(unit.citationToken),
    ),
  };
}
