import rehypeKatex from "rehype-katex";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { type PluggableList, unified } from "unified";

export const quizMarkdownRemarkPlugins = [remarkGfm, remarkMath] satisfies PluggableList;
export const quizMarkdownRehypePlugins = [rehypeKatex] satisfies PluggableList;

const surveyMarkdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype)
  // Raw HTML is not enabled. Sanitize the user-authored tree before the trusted KaTeX transform.
  .use(rehypeSanitize)
  .use(rehypeKatex)
  .use(rehypeStringify);

function escapedPlainText(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("\n", "<br>");
}

export function quizMarkdownToSafeHtml(markdown: string) {
  try {
    return String(surveyMarkdownProcessor.processSync(markdown));
  } catch {
    return escapedPlainText(markdown);
  }
}
