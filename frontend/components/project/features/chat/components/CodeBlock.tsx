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
    <div className="relative group my-2 rounded-lg overflow-hidden border border-zinc-200 bg-zinc-50">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-100 border-b border-zinc-200">
        <span className="text-[10px] font-medium text-zinc-500 uppercase">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-zinc-200 rounded"
        >
          {copied ? (
            <Check className="w-3 h-3 text-emerald-500" />
          ) : (
            <Copy className="w-3 h-3 text-zinc-400" />
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
