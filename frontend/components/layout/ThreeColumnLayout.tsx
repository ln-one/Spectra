"use client";

import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

interface ThreeColumnLayoutProps {
  /** 左栏 - Studio：工具与模式切换 */
  leftPanel: ReactNode;
  /** 中栏 - Conversation：对话与生成交互主舞台 */
  centerPanel: ReactNode;
  /** 右栏 - Sources：素材与 RAG 资源管理 */
  rightPanel: ReactNode;
  /** 左侧栏宽度 */
  leftWidth?: string;
  /** 右侧栏宽度 */
  rightWidth?: string;
  /** 最小内容区宽度 */
  minContentWidth?: string;
  className?: string;
}

export function ThreeColumnLayout({
  leftPanel,
  centerPanel,
  rightPanel,
  leftWidth = "280px",
  rightWidth = "320px",
  minContentWidth = "500px",
  className,
}: ThreeColumnLayoutProps) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  return (
    <div className={cn("flex h-full w-full", className)}>
      {/* 左栏 - Studio */}
      <aside
        className={cn(
          "border-r bg-card transition-all duration-300 flex flex-col",
          leftCollapsed ? "w-0 overflow-hidden" : leftWidth
        )}
      >
        {leftPanel}
      </aside>

      {/* 中栏 - Conversation（主舞台） */}
      <main
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-300",
          leftCollapsed && rightCollapsed && "max-w-full",
          leftCollapsed && !rightCollapsed && `max-w-[calc(100%-${rightWidth})]`,
          !leftCollapsed && rightCollapsed && `max-w-[calc(100%-${leftWidth})]`,
          !leftCollapsed && !rightCollapsed && `max-w-[calc(100%-${leftWidth}-${rightWidth})]`
        )}
        style={{ minWidth: minContentWidth }}
      >
        {centerPanel}
      </main>

      {/* 右栏 - Sources */}
      <aside
        className={cn(
          "border-l bg-card transition-all duration-300 flex flex-col",
          rightCollapsed ? "w-0 overflow-hidden" : rightWidth
        )}
      >
        {rightPanel}
      </aside>
    </div>
  );
}

/** 控制面板 Props */
interface PanelControlProps {
  collapsed: boolean;
  onToggle: () => void;
  position: "left" | "right";
}

/** 面板折叠控制按钮 */
export function PanelControl({
  collapsed,
  onToggle,
  position,
}: PanelControlProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 z-10 w-6 h-12 bg-background border rounded-r-md flex items-center justify-center hover:bg-accent transition-colors",
        position === "left" && "-right-3 rounded-r-md rounded-l-none" && (collapsed ? "right-0" : "-right-3"),
        position === "right" && "-left-3 rounded-l-md rounded-r-none" && (collapsed ? "left-0" : "-left-3")
      )}
      aria-label={collapsed ? "展开面板" : "折叠面板"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          "transition-transform",
          position === "left" && collapsed && "rotate-180",
          position === "right" && !collapsed && "rotate-180"
        )}
      >
        {position === "left" ? (
          <path d="m9 18 6-6-6-6" />
        ) : (
          <path d="m15 18-6-6 6-6" />
        )}
      </svg>
    </button>
  );
}
