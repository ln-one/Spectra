import type { QuizRevisionContent } from "./contract";

const PAGE_LIMIT = 12_000;

export function quizMarkdownPage(content: QuizRevisionContent, cursor: number) {
  const blocks = content.questions.map((question, index) => {
    const lines = [
      `## ${index + 1}. ${question.promptMarkdown}`,
      `[question_id=${question.questionId}]`,
      `type: ${question.type}; difficulty: ${question.difficulty}; points: ${question.points}`,
    ];
    if (question.type !== "true_false") {
      lines.push(
        ...question.options.map((option) => `- [option_id=${option.optionId}] ${option.text}`),
      );
    }
    lines.push(
      question.type === "single_choice"
        ? `correctOptionId: ${question.correctOptionId}`
        : question.type === "multiple_choice"
          ? `correctOptionIds: ${question.correctOptionIds.join(", ")}`
          : `correctAnswer: ${question.correctAnswer}`,
      `explanation: ${question.explanationMarkdown}`,
    );
    return lines.join("\n");
  });
  const prefix = cursor === 0 ? [`# ${content.title}`, content.descriptionMarkdown] : [];
  let markdown = prefix.filter(Boolean).join("\n\n");
  let nextCursor: number | null = null;
  for (let index = cursor; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block) continue;
    const candidate = markdown ? `${markdown}\n\n${block}` : block;
    if (candidate.length > PAGE_LIMIT && markdown) {
      nextCursor = index;
      break;
    }
    markdown = candidate;
  }
  return { markdown, nextCursor };
}
