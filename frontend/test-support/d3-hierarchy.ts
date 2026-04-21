type TreeNode<T> = {
  data: T;
  depth: number;
  parent: TreeNode<T> | null;
  children?: TreeNode<T>[];
  x: number;
  y: number;
  ancestors: () => TreeNode<T>[];
  descendants: () => TreeNode<T>[];
  each: (callback: (node: TreeNode<T>) => void) => void;
};

function attachHelpers<T>(root: TreeNode<T>) {
  const walk = (node: TreeNode<T>, callback: (current: TreeNode<T>) => void) => {
    callback(node);
    for (const child of node.children ?? []) {
      walk(child, callback);
    }
  };

  const descendants = (node: TreeNode<T>) => {
    const result: TreeNode<T>[] = [];
    walk(node, (current) => result.push(current));
    return result;
  };

  const ancestors = (node: TreeNode<T>) => {
    const result: TreeNode<T>[] = [];
    let current: TreeNode<T> | null = node;
    while (current) {
      result.push(current);
      current = current.parent;
    }
    return result;
  };

  walk(root, (node) => {
    node.descendants = () => descendants(node);
    node.ancestors = () => ancestors(node);
    node.each = (callback) => walk(node, callback);
  });
}

export function hierarchy<T>(
  data: T,
  childrenAccessor: (node: T) => T[] | undefined
): TreeNode<T> {
  const build = (nodeData: T, parent: TreeNode<T> | null, depth: number): TreeNode<T> => {
    const node: TreeNode<T> = {
      data: nodeData,
      depth,
      parent,
      children: undefined,
      x: 0,
      y: 0,
      ancestors: () => [],
      descendants: () => [],
      each: () => undefined,
    };
    const rawChildren = childrenAccessor(nodeData) ?? [];
    if (rawChildren.length > 0) {
      node.children = rawChildren.map((child) => build(child, node, depth + 1));
    }
    return node;
  };

  const root = build(data, null, 0);
  attachHelpers(root);
  return root;
}

export function tree<T>() {
  let nodeSizeX = 180;
  let nodeSizeY = 320;

  const layout = (root: TreeNode<T>) => {
    let row = 0;
    const place = (node: TreeNode<T>) => {
      const children = node.children ?? [];
      if (!children.length) {
        node.x = row * nodeSizeX;
        row += 1;
      } else {
        children.forEach(place);
        const first = children[0];
        const last = children[children.length - 1];
        node.x = ((first?.x ?? 0) + (last?.x ?? 0)) / 2;
      }
      node.y = node.depth * nodeSizeY;
    };

    place(root);
    attachHelpers(root);
    return root;
  };

  layout.nodeSize = ([x, y]: [number, number]) => {
    nodeSizeX = x;
    nodeSizeY = y;
    return layout;
  };

  layout.separation = (_callback: unknown) => layout;

  return layout;
}
