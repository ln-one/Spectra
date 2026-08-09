import { AlertCircle } from "lucide-react";

export function AuthError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl bg-[var(--app-danger-bg)] p-4 text-sm leading-6 text-[var(--app-danger)]"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0">{message}</p>
    </div>
  );
}
