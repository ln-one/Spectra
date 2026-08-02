import type { LucideProps } from "lucide-react";
import { forwardRef } from "react";

export const WorkspaceSourceIcon = forwardRef<SVGSVGElement, LucideProps>(
  (
    {
      absoluteStrokeWidth: _absoluteStrokeWidth,
      children,
      color = "currentColor",
      size = 24,
      strokeWidth = 1.8,
      ...props
    },
    ref,
  ) => {
    return (
      <svg
        ref={ref}
        aria-hidden="true"
        focusable="false"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <path
          data-part="workspace-network-edge"
          d="M2.25 12h6.25M15.5 12h1.25c1.5 0 1.75-5 3.25-5h1.25M16.75 12c1.5 0 1.75 5 3.25 5h1.25"
          stroke="var(--workspace-network-edge, #77819a)"
          strokeOpacity="0.8"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          data-part="workspace-network-entry"
          cx="3"
          cy="12"
          r="2.25"
          fill="var(--workspace-network-entry, #e9a23b)"
        />
        <rect
          data-part="workspace-network-node"
          x="8"
          y="7"
          width="8"
          height="10"
          rx="3"
          fill="var(--workspace-network-primary, #5b6ee1)"
          stroke="var(--workspace-source-icon-surface, white)"
          strokeWidth="1.25"
        />
        <path
          data-part="workspace-network-portal"
          d="M11 10.25h2v3.5h-2"
          stroke="white"
          strokeOpacity="0.88"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          data-part="workspace-network-node"
          cx="21"
          cy="7"
          r="2.4"
          fill="var(--workspace-network-secondary, #9b7ad9)"
          stroke="var(--workspace-source-icon-surface, white)"
          strokeWidth="1.25"
        />
        <circle
          data-part="workspace-network-node"
          cx="21"
          cy="17"
          r="2.4"
          fill="var(--workspace-network-accent, #e9a23b)"
          stroke="var(--workspace-source-icon-surface, white)"
          strokeWidth="1.25"
        />
        {children}
      </svg>
    );
  },
);

WorkspaceSourceIcon.displayName = "WorkspaceSourceIcon";
