import { markdownProjectableBlocks, type ProjectableBlock } from "@/features/knowledge/projection";
import { teachingDocumentRevisionToMarkdown } from "./documents/markdown";
import { flapRevivalGameRevisionContentSchema } from "./games/contract";
import { mindMapRevisionContentSchema } from "./mind-maps/contract";
import { type QuizRevisionContent, quizRevisionContentSchema } from "./quizzes/contract";
import type { ArtifactSourceKind } from "./types";

function mindMapProjectableBlocks(content: unknown): ProjectableBlock[] {
  const revision = mindMapRevisionContentSchema.parse(content);
  const byId = new Map(revision.nodes.map((node) => [node.id, node]));
  const originalIndex = new Map(revision.nodes.map((node, index) => [node.id, index]));
  const children = new Map<string, typeof revision.nodes>();
  for (const node of revision.nodes) {
    if (node.parentId === null) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  }

  const blocks: ProjectableBlock[] = [];
  const visit = (nodeId: string, parentPath: string[]) => {
    const node = byId.get(nodeId);
    if (!node) return;
    const path = [...parentPath, node.label];
    const text = [`Path: ${path.join(" > ")}`, `Node: ${node.label}`];
    if (node.note) text.push(`Note: ${node.note}`);
    blocks.push({
      kind: "structured_node",
      headingPath: path,
      exactText: text.join("\n"),
      locator: {
        kind: "structured_path",
        dialect: "json-pointer",
        path: `/nodes/${originalIndex.get(node.id) ?? 0}`,
      },
    });
    for (const child of children.get(node.id) ?? []) visit(child.id, path);
  };
  visit(revision.rootId, []);
  return blocks;
}

function questionProjectableBlocks(
  revision: Pick<QuizRevisionContent, "questions" | "title">,
): ProjectableBlock[] {
  return revision.questions.map((question, index) => {
    const lines = [`Question: ${question.promptMarkdown}`];
    if (question.type === "true_false") {
      lines.push(
        `Options: True; False`,
        `Correct answer: ${question.correctAnswer ? "True" : "False"}`,
      );
    } else {
      lines.push("Options:", ...question.options.map((option) => `- ${option.text}`));
      const correctIds =
        question.type === "single_choice"
          ? new Set([question.correctOptionId])
          : new Set(question.correctOptionIds);
      lines.push(
        `Correct answer: ${question.options
          .filter((option) => correctIds.has(option.optionId))
          .map((option) => option.text)
          .join("; ")}`,
      );
    }
    lines.push(`Explanation: ${question.explanationMarkdown}`);
    return {
      kind: "structured_node",
      headingPath: [revision.title, `Question ${index + 1}`],
      exactText: lines.join("\n"),
      locator: {
        kind: "structured_path",
        dialect: "json-pointer",
        path: `/questions/${index}`,
      },
    };
  });
}

function quizProjectableBlocks(content: unknown): ProjectableBlock[] {
  return questionProjectableBlocks(quizRevisionContentSchema.parse(content));
}

function gameProjectableBlocks(content: unknown): ProjectableBlock[] {
  return questionProjectableBlocks(flapRevivalGameRevisionContentSchema.parse(content));
}

export function artifactSourceProjectableBlocks(
  kind: Exclude<ArtifactSourceKind, "presentation">,
  content: unknown,
): ProjectableBlock[] {
  switch (kind) {
    case "teaching_document":
      return markdownProjectableBlocks(teachingDocumentRevisionToMarkdown(content));
    case "mind_map":
      return mindMapProjectableBlocks(content);
    case "quiz":
      return quizProjectableBlocks(content);
    case "game":
      return gameProjectableBlocks(content);
  }
}
