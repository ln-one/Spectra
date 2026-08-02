import type { InputHTMLAttributes } from "react";

export function AuthInput({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[var(--app-text)]">{label}</span>
      <input
        required
        {...props}
        className="h-12 w-full rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface-subtle)] px-4 text-[var(--app-text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--app-text-muted)] focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10"
      />
    </label>
  );
}
