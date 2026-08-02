import type { ReactNode } from "react";

export function PanelShell({
  testId,
  children,
  className = "",
  overflowVisible = false,
}: {
  testId: string;
  children: ReactNode;
  className?: string;
  overflowVisible?: boolean;
}) {
  return (
    <section
      data-testid={testId}
      className={`workspace-panel-card h-full select-none rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] text-[var(--workspace-text-primary)] shadow-lg backdrop-blur-xl ${overflowVisible ? "overflow-visible" : "overflow-hidden"} ${className}`}
    >
      {children}
    </section>
  );
}
