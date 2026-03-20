"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

export function CodeBlock({
  language,
  children,
}: {
  language?: string;
  children: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-2 overflow-hidden rounded-xl border border-[var(--project-border)] bg-[var(--project-surface-muted)]">
      <div className="flex items-center justify-between border-b border-[var(--project-border)] bg-[var(--project-surface)] px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase text-[var(--project-text-muted)]">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--project-surface-elevated)]"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3 text-[var(--project-text-muted)]" />
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={oneLight}
        customStyle={{
          margin: 0,
          padding: "12px 16px",
          fontSize: "12px",
          background: "transparent",
        }}
        codeTagProps={{
          style: {
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          },
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

