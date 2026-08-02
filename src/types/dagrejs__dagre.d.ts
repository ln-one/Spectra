declare module "@dagrejs/dagre" {
  type NodeLabel = { height: number; width: number; x?: number; y?: number };

  class Graph {
    node(id: string): NodeLabel & { x: number; y: number };
    setDefaultEdgeLabel(factory: () => object): void;
    setEdge(source: string, target: string): void;
    setGraph(options: {
      marginx: number;
      marginy: number;
      nodesep: number;
      rankdir: "LR" | "RL";
      ranksep: number;
    }): void;
    setNode(id: string, label: NodeLabel): void;
  }

  const dagre: {
    graphlib: { Graph: typeof Graph };
    layout(graph: Graph): void;
  };

  export default dagre;
}
