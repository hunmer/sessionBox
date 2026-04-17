declare module '@dagrejs/dagre' {
  export namespace graphlib {
    class Graph {
      setNode(id: string, options?: Record<string, unknown>): void
      setEdge(source: string, target: string, options?: Record<string, unknown>): void
      node(id: string): { x: number; y: number; width: number; height: number }
      setDefaultEdgeLabel(fn: () => Record<string, unknown>): void
    }
  }
  export function layout(graph: graphlib.Graph): void
}
