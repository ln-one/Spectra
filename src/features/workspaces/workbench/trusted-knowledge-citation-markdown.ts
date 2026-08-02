import type { Link, Parent, Root, RootContent, Text, ThematicBreak } from "mdast";
import type { Plugin } from "unified";
import {
  type KnowledgeCitationEvidence,
  knowledgeEvidenceByCitationNumber,
  knowledgeEvidenceHref,
  parseKnowledgeEvidenceHref,
  trustedKnowledgeCitationFallbacks,
} from "@/features/agents/knowledge-citation-contract";

function citationLink(evidence: KnowledgeCitationEvidence): Link {
  return {
    children: [{ type: "text", value: String(evidence.citationNumber) }],
    title: null,
    type: "link",
    url: knowledgeEvidenceHref(evidence.citationToken),
  };
}

function replaceTrustedCitationText(
  node: Text,
  byNumber: ReadonlyMap<number, KnowledgeCitationEvidence>,
): RootContent[] | null {
  const matches = trustedKnowledgeCitationFallbacks(node.value, byNumber);
  if (matches.length === 0) return null;
  const children: RootContent[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      children.push({ type: "text", value: node.value.slice(cursor, match.start) });
    }
    children.push(citationLink(match.evidence));
    cursor = match.end;
  }
  if (cursor < node.value.length) {
    children.push({ type: "text", value: node.value.slice(cursor) });
  }
  return children;
}

function transformParent(parent: Parent, byNumber: ReadonlyMap<number, KnowledgeCitationEvidence>) {
  const children: RootContent[] = [];
  for (const child of parent.children as RootContent[]) {
    if (child.type === "text") {
      children.push(...(replaceTrustedCitationText(child, byNumber) ?? [child]));
      continue;
    }
    if ("children" in child) transformParent(child as Parent, byNumber);
    children.push(child);
  }
  parent.children = children;
}

function visualMarker(citationToken: string): ThematicBreak {
  return {
    data: {
      hName: "div",
      hProperties: {
        "data-knowledge-visual-token": citationToken,
      },
    },
    type: "thematicBreak",
  };
}

function visualCitationTokens(node: RootContent, allowedTokens: ReadonlySet<string>): string[] {
  const tokens: string[] = [];
  const visit = (child: RootContent) => {
    if (child.type === "link") {
      const citationToken = parseKnowledgeEvidenceHref(child.url);
      if (citationToken && allowedTokens.has(citationToken)) tokens.push(citationToken);
    }
    if ("children" in child) {
      for (const descendant of child.children as RootContent[]) visit(descendant);
    }
  };
  visit(node);
  return tokens;
}

function acceptsVisualMarkers(parent: Parent) {
  return parent.type === "root" || parent.type === "blockquote" || parent.type === "listItem";
}

function isStandaloneVisualCitation(node: RootContent, allowedTokens: ReadonlySet<string>) {
  if (node.type !== "paragraph") return false;
  const meaningfulChildren = node.children.filter(
    (child) => child.type !== "text" || child.value.trim().length > 0,
  );
  if (meaningfulChildren.length !== 1) return false;
  const onlyChild = meaningfulChildren[0];
  if (onlyChild?.type !== "link") return false;
  const citationToken = parseKnowledgeEvidenceHref(onlyChild.url);
  return citationToken !== null && allowedTokens.has(citationToken);
}

function placeVisualMarkers(
  parent: Parent,
  allowedTokens: ReadonlySet<string>,
  placedTokens: Set<string>,
) {
  const children: RootContent[] = [];
  for (const child of parent.children as RootContent[]) {
    if ("children" in child) {
      placeVisualMarkers(child as Parent, allowedTokens, placedTokens);
    }
    const acceptsMarkers = acceptsVisualMarkers(parent);
    const citationTokens = acceptsMarkers ? visualCitationTokens(child, allowedTokens) : [];
    if (!acceptsMarkers || !isStandaloneVisualCitation(child, allowedTokens)) {
      children.push(child);
    }
    for (const citationToken of citationTokens) {
      if (placedTokens.has(citationToken)) continue;
      placedTokens.add(citationToken);
      children.push(visualMarker(citationToken));
    }
  }
  parent.children = children;
}

export function trustedKnowledgeCitationRemarkPlugin(
  evidence: readonly KnowledgeCitationEvidence[],
  visualEvidenceTokens: readonly string[] = [],
): Plugin<[], Root> {
  const byNumber = knowledgeEvidenceByCitationNumber(evidence);
  const allowedVisualTokens = new Set(visualEvidenceTokens);
  return () => (tree) => {
    transformParent(tree, byNumber);
    placeVisualMarkers(tree, allowedVisualTokens, new Set());
  };
}
