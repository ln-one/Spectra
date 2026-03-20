"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ToolPanelShell } from "./ToolPanelShell";
import type { ToolPanelProps } from "./types";

interface MindNode {
  id: string;
  label: string;
  children?: MindNode[];
}

const INITIAL_TREE: MindNode = {
  id: "root",
  label: "化学反应速率",
  children: [
    {
      id: "n1",
      label: "影响因素",
      children: [
        { id: "n1-1", label: "温度" },
        { id: "n1-2", label: "浓度" },
      ],
    },
    {
      id: "n2",
      label: "实验观察",
      children: [{ id: "n2-1", label: "颜色变化" }],
    },
  ],
};

function injectChildren(node: MindNode, targetId: string): MindNode {
  if (node.id === targetId) {
    const existing = node.children ?? [];
    const base = `${targetId}-${existing.length + 1}`;
    return {
      ...node,
      children: [
        ...existing,
        { id: `${base}a`, label: `${node.label}·子节点A` },
        { id: `${base}b`, label: `${node.label}·子节点B` },
      ],
    };
  }
  return {
    ...node,
    children: node.children?.map((child) => injectChildren(child, targetId)),
  };
}

export function MindmapToolPanel({ toolName }: ToolPanelProps) {
  const [tree, setTree] = useState<MindNode>(INITIAL_TREE);
  const [selectedId, setSelectedId] = useState("root");

  const renderNode = (node: MindNode, depth = 0) => {
    const isSelected = selectedId === node.id;
    return (
      <div key={node.id} className="space-y-1">
        <button
          type="button"
          onClick={() => setSelectedId(node.id)}
          className={`w-full text-left rounded-md px-2 py-1.5 text-xs border transition-colors ${
            isSelected
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
          }`}
          style={{ marginLeft: `${depth * 12}px` }}
        >
          {node.label}
        </button>
        {node.children?.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <ToolPanelShell
      stepTitle={`${toolName}配置`}
      stepDescription="选择节点后可继续向下拆分，模拟对话微调带来的导图生长。"
      previewTitle="导图渲染占位"
      previewDescription="后续可替换为 Markmap / React Flow 画布。"
      footer={
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">
            当前高亮节点：{selectedId}
          </span>
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-lg text-xs"
            onClick={() => setTree((prev) => injectChildren(prev, selectedId))}
          >
            向下拆分两级
          </Button>
        </div>
      }
      preview={
        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3">
          <p className="text-[11px] text-zinc-500 mb-2">
            节点列表（可点击高亮）
          </p>
          <div className="space-y-1">{renderNode(tree)}</div>
        </div>
      }
    >
      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <p className="text-xs text-zinc-600">
          提示：在后续版本中，选中节点后可通过 Chat 指令继续细化分支内容。
        </p>
      </section>
    </ToolPanelShell>
  );
}
