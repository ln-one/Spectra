import type { MindNode, MindmapFocus } from "./types";

export function createBaseTree(
  topic: string,
  focus: MindmapFocus,
  depth: number
): MindNode {
  const level2 =
    focus === "process"
      ? ["准备阶段", "执行阶段", "复盘阶段"]
      : focus === "comparison"
        ? ["核心特征", "易混概念", "应用场景"]
        : ["核心概念", "关键要点", "常见误区"];

  const level3 =
    focus === "process"
      ? ["目标", "方法", "检查点"]
      : focus === "comparison"
        ? ["相同点", "不同点", "判断方法"]
        : ["定义", "例子", "边界条件"];

  const level4 =
    focus === "process"
      ? ["课堂活动", "提问设计"]
      : focus === "comparison"
        ? ["典型题", "反例"]
        : ["正例", "反例"];

  const secondLevelNodes: MindNode[] = level2.map((label, index) => {
    const secondId = `n2-${index + 1}`;
    if (depth <= 2) {
      return { id: secondId, label };
    }

    const thirdLevelNodes: MindNode[] = level3.map((subLabel, subIndex) => {
      const thirdId = `${secondId}-n3-${subIndex + 1}`;
      if (depth <= 3) {
        return { id: thirdId, label: subLabel };
      }

      return {
        id: thirdId,
        label: subLabel,
        children: level4.map((leaf, leafIndex) => ({
          id: `${thirdId}-n4-${leafIndex + 1}`,
          label: leaf,
        })),
      };
    });

    return { id: secondId, label, children: thirdLevelNodes };
  });

  return { id: "root", label: topic, children: secondLevelNodes };
}

export function injectChildren(node: MindNode, targetId: string): MindNode {
  if (node.id === targetId) {
    const existing = node.children ?? [];
    const nextIndex = existing.length + 1;
    return {
      ...node,
      children: [
        ...existing,
        {
          id: `${targetId}-x${nextIndex}`,
          label: `${node.label} · 补充分支 ${nextIndex}`,
        },
        {
          id: `${targetId}-x${nextIndex + 1}`,
          label: `${node.label} · 关联案例`,
        },
      ],
    };
  }

  return {
    ...node,
    children: node.children?.map((child) => injectChildren(child, targetId)),
  };
}

export function countNodes(node: MindNode): number {
  const childrenCount =
    node.children?.reduce((sum, child) => sum + countNodes(child), 0) ?? 0;
  return 1 + childrenCount;
}

export function findNodeById(
  node: MindNode,
  targetId: string
): MindNode | null {
  if (node.id === targetId) return node;
  for (const child of node.children ?? []) {
    const result = findNodeById(child, targetId);
    if (result) return result;
  }
  return null;
}

export function findNodePath(node: MindNode, targetId: string): string[] {
  if (node.id === targetId) {
    return [node.label];
  }
  for (const child of node.children ?? []) {
    const childPath = findNodePath(child, targetId);
    if (childPath.length > 0) {
      return [node.label, ...childPath];
    }
  }
  return [];
}
