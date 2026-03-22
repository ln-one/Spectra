import type { MindNode } from "./types";

interface MindmapTreeListProps {
  node: MindNode;
  selectedId: string;
  onSelect: (id: string) => void;
  level?: number;
}

export function MindmapTreeList({
  node,
  selectedId,
  onSelect,
  level = 0,
}: MindmapTreeListProps) {
  const isSelected = node.id === selectedId;

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
          isSelected
            ? "border-teal-500 bg-teal-50 text-teal-700"
            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
        }`}
        style={{ marginLeft: `${Math.min(level * 14, 42)}px` }}
      >
        {node.label}
      </button>
      {node.children?.map((child) => (
        <MindmapTreeList
          key={child.id}
          node={child}
          selectedId={selectedId}
          onSelect={onSelect}
          level={level + 1}
        />
      ))}
    </div>
  );
}
