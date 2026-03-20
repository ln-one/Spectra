"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./CodeBlock";

export function MarkdownContent({
  content,
  isUser,
}: {
  content: string;
  isUser: boolean;
}) {
  const components = useMemo(
    () => ({
      code: ({
        inline,
        className,
        children,
        ...props
      }: {
        inline?: boolean;
        className?: string;
        children?: React.ReactNode;
      } & React.HTMLAttributes<HTMLElement>) => {
        const match = /language-(\w+)/.exec(className || "");
        const codeString = String(children).replace(/\n$/, "");

        if (!inline && match) {
          return <CodeBlock language={match[1]}>{codeString}</CodeBlock>;
        }

        return (
          <code
            className={cn(
              "rounded px-1.5 py-0.5 font-mono text-[13px]",
              isUser
                ? "bg-[var(--project-accent)] text-[var(--project-accent-text)]"
                : "bg-[var(--project-surface-muted)] text-[var(--project-text-primary)]"
            )}
            {...props}
          >
            {children}
          </code>
        );
      },
      p: ({ children }: { children?: React.ReactNode }) => (
        <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
      ),
      ul: ({ children }: { children?: React.ReactNode }) => (
        <ul className="mb-2 ml-4 list-outside list-disc space-y-1">
          {children}
        </ul>
      ),
      ol: ({ children }: { children?: React.ReactNode }) => (
        <ol className="mb-2 ml-4 list-outside list-decimal space-y-1">
          {children}
        </ol>
      ),
      li: ({ children }: { children?: React.ReactNode }) => (
        <li className="text-sm leading-relaxed">{children}</li>
      ),
      strong: ({ children }: { children?: React.ReactNode }) => (
        <strong className="font-semibold">{children}</strong>
      ),
      em: ({ children }: { children?: React.ReactNode }) => (
        <em className="italic">{children}</em>
      ),
      h1: ({ children }: { children?: React.ReactNode }) => (
        <h1 className="mb-2 mt-3 text-lg font-bold first:mt-0">{children}</h1>
      ),
      h2: ({ children }: { children?: React.ReactNode }) => (
        <h2 className="mb-2 mt-3 text-base font-bold first:mt-0">{children}</h2>
      ),
      h3: ({ children }: { children?: React.ReactNode }) => (
        <h3 className="mb-1 mt-2 text-sm font-bold first:mt-0">{children}</h3>
      ),
      blockquote: ({ children }: { children?: React.ReactNode }) => (
        <blockquote className="my-2 border-l-2 border-[var(--project-border-strong)] pl-3 italic text-[var(--project-text-muted)]">
          {children}
        </blockquote>
      ),
      hr: () => <hr className="my-3 border-[var(--project-border)]" />,
      a: ({
        href,
        children,
      }: {
        href?: string;
        children?: React.ReactNode;
      }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "underline underline-offset-2",
            isUser
              ? "text-[var(--project-accent-text)]"
              : "text-blue-600 hover:text-blue-800"
          )}
        >
          {children}
        </a>
      ),
    }),
    [isUser]
  );

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
