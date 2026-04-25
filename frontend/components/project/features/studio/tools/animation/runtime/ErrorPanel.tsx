"use client";

import type { AnimationCompileError } from "./types";

interface ErrorPanelProps {
  title: string;
  description: string;
  errors: AnimationCompileError[];
}

export function AnimationRuntimeErrorPanel({
  title,
  description,
  errors,
}: ErrorPanelProps) {
  return (
    <section className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 text-zinc-900">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-zinc-600">{description}</p>
      <div className="mt-3 space-y-2">
        {errors.map((item, index) => (
          <div
            key={`${item.message}-${index}`}
            className="rounded-xl border border-white/80 bg-white/85 px-3 py-2 text-[11px] shadow-sm"
          >
            <p className="font-medium text-zinc-900">{item.message}</p>
            {item.line || item.column ? (
              <p className="mt-1 text-zinc-500">
                {item.line ? `line ${item.line}` : "line ?"}
                {item.column ? `, column ${item.column}` : ""}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
