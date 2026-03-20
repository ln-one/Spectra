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
              "px-1.5 py-0.5 rounded text-[13px] font-mono",
              isUser ? "bg-zinc-800 text-zinc-100" : "bg-zinc-200 text-zinc-800"
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
        <ul className="list-disc list-outside ml-4 mb-2 space-y-1">
          {children}
        </ul>
      ),
      ol: ({ children }: { children?: React.ReactNode }) => (
        <ol className="list-decimal list-outside ml-4 mb-2 space-y-1">
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
        <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h1>
      ),
      h2: ({ children }: { children?: React.ReactNode }) => (
        <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h2>
      ),
      h3: ({ children }: { children?: React.ReactNode }) => (
        <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{children}</h3>
      ),
      blockquote: ({ children }: { children?: React.ReactNode }) => (
        <blockquote className="border-l-2 border-zinc-300 pl-3 my-2 italic text-zinc-600">
          {children}
        </blockquote>
      ),
      hr: () => <hr className="my-3 border-zinc-200" />,
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
              ? "text-zinc-200 hover:text-white"
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
