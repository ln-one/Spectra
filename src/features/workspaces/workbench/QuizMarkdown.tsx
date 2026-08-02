"use client";

import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import { MermaidDiagram } from "@/features/artifacts/documents/MermaidDiagram";
import { quizMarkdownRehypePlugins, quizMarkdownRemarkPlugins } from "./quiz-markdown";

function safeHref(href: string | undefined) {
  return href && /^(?:https?:|mailto:|#)/i.test(href) ? href : null;
}

export function QuizMarkdown({ markdown }: { markdown: string }) {
  const t = useTranslations("Quiz");
  return (
    <div className="teaching-document-markdown select-text text-sm leading-7 text-[var(--workspace-text-primary)]">
      <ReactMarkdown
        rehypePlugins={quizMarkdownRehypePlugins}
        remarkPlugins={quizMarkdownRemarkPlugins}
        components={{
          a: ({ children, href }) => {
            const safe = safeHref(href);
            return safe ? <a href={safe}>{children}</a> : <span>{children}</span>;
          },
          code: ({ children, className }) =>
            className === "language-mermaid" ? (
              <MermaidDiagram errorLabel={t("diagramFailed")} source={String(children)} />
            ) : (
              <code className={className}>{children}</code>
            ),
          img: ({ alt }) => <span>{alt?.trim() || "…"}</span>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
