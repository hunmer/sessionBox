import type {
  SplitDirection,
  SplitDropPosition,
  SplitLayoutType,
  SplitNode,
  SplitPane,
  SplitPresetType
} from '@/types'

const DEFAULT_BRANCH_SIZES = [50, 50]

function sanitizeSize(value: number | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : 1
}

export function normalizeSizes(sizes: number[], count = 2): number[] {
  const normalized = Array.from({ length: count }, (_, index) => sanitizeSize(sizes[index]))
  const total = normalized.reduce((sum, value) => sum + value, 0) || count
  return normalized.map((value) => Number(((value / total) * 100).toFixed(2)))
}

export function cloneSplitNode(node: SplitNode): SplitNode {
  if (node.kind === 'pane') {
    return { ...node }
  }

  return {
    kind: 'branch',
    direction: node.direction,
    sizes: [...node.sizes],
    children: node.children.map(cloneSplitNode)
  }
}

function createPaneNode(paneId: string): SplitNode {
  return { kind: 'pane', paneId }
}

function createBranchNode(direction: SplitDirection, children: SplitNode[], sizes = DEFAULT_BRANCH_SIZES): SplitNode {
  return {
    kind: 'branch',
    direction,
    sizes: normalizeSizes(sizes, children.length),
    children
  }
}

export function buildPresetTree(presetType: Exclude<SplitPresetType, '1'>, panes: Array<Pick<SplitPane, 'id'>>): SplitNode {
  switch (presetType) {
    case '2h':
      return createBranchNode('horizontal', [
        createPaneNode(panes[0]!.id),
        createPaneNode(panes[1]!.id)
      ])
    case '2v':
      return createBranchNode('vertical', [
        createPaneNode(panes[0]!.id),
        createPaneNode(panes[1]!.id)
      ])
    case '3':
      return createBranchNode('horizontal', [
        createPaneNode(panes[0]!.id),
        createBranchNode('vertical', [
          createPaneNode(panes[1]!.id),
          createPaneNode(panes[2]!.id)
        ])
      ])
    case '4':
      return createBranchNode('horizontal', [
        createBranchNode('vertical', [
          createPaneNode(panes[0]!.id),
          createPaneNode(panes[1]!.id)
        ]),
        createBranchNode('vertical', [
          createPaneNode(panes[2]!.id),
          createPaneNode(panes[3]!.id)
        ])
      ])
  }
}

export function buildFallbackTree(panes: Array<Pick<SplitPane, 'id'>>): SplitNode {
  if (panes.length <= 1) {
    return createPaneNode(panes[0]?.id ?? 'pane-missing')
  }

  if (panes.length === 2) {
    return buildPresetTree('2h', panes)
  }

  if (panes.length === 3) {
    return buildPresetTree('3', panes)
  }

  return buildPresetTree('4', panes.slice(0, 4))
}

export function countSplitLeaves(node: SplitNode): number {
  if (node.kind === 'pane') return 1
  return node.children.reduce((count, child) => count + countSplitLeaves(child), 0)
}

export function collectPaneIds(node: SplitNode): string[] {
  if (node.kind === 'pane') return [node.paneId]
  return node.children.flatMap(collectPaneIds)
}

export function remapTreePaneIds(node: SplitNode, paneIds: string[]): SplitNode {
  let cursor = 0

  function walk(current: SplitNode): SplitNode {
    if (current.kind === 'pane') {
      const nextPaneId = paneIds[cursor] ?? current.paneId
      cursor += 1
      return { kind: 'pane', paneId: nextPaneId }
    }

    return {
      kind: 'branch',
      direction: current.direction,
      sizes: normalizeSizes(current.sizes, current.children.length),
      children: current.children.map(walk)
    }
  }

  return walk(node)
}

function isPaneNode(node: SplitNode): boolean {
  return node.kind === 'pane'
}

export function detectLayoutType(root: SplitNode): SplitLayoutType {
  const paneCount = countSplitLeaves(root)

  if (paneCount <= 1) {
    return '1'
  }

  if (root.kind !== 'branch' || root.children.length !== 2) {
    return 'custom'
  }

  if (paneCount === 2 && root.children.every(isPaneNode)) {
    return root.direction === 'horizontal' ? '2h' : '2v'
  }

  if (
    paneCount === 3 &&
    root.direction === 'horizontal' &&
    root.children[0]?.kind === 'pane' &&
    root.children[1]?.kind === 'branch' &&
    root.children[1].direction === 'vertical' &&
    root.children[1].children.length === 2 &&
    root.children[1].children.every(isPaneNode)
  ) {
    return '3'
  }

  if (
    paneCount === 4 &&
    root.direction === 'horizontal' &&
    root.children.length === 2 &&
    root.children.every(
      (child) =>
        child.kind === 'branch' &&
        child.direction === 'vertical' &&
        child.children.length === 2 &&
        child.children.every(isPaneNode)
    )
  ) {
    return '4'
  }

  return 'custom'
}

export function reorderPanesByTree(panes: SplitPane[], root: SplitNode): SplitPane[] {
  const paneMap = new Map(panes.map((pane) => [pane.id, pane]))
  return collectPaneIds(root)
    .map((paneId, order) => {
      const pane = paneMap.get(paneId)
      if (!pane) return null
      return {
        ...pane,
        order
      }
    })
    .filter((pane): pane is SplitPane => pane != null)
}

function swapPaneIds(root: SplitNode, sourcePaneId: string, targetPaneId: string): SplitNode {
  if (root.kind === 'pane') {
    if (root.paneId === sourcePaneId) return { kind: 'pane', paneId: targetPaneId }
    if (root.paneId === targetPaneId) return { kind: 'pane', paneId: sourcePaneId }
    return { ...root }
  }

  return {
    kind: 'branch',
    direction: root.direction,
    sizes: [...root.sizes],
    children: root.children.map((child) => swapPaneIds(child, sourcePaneId, targetPaneId))
  }
}

function removePaneNode(root: SplitNode, paneId: string): SplitNode | null {
  if (root.kind === 'pane') {
    return root.paneId === paneId ? null : { ...root }
  }

  const nextChildren = root.children
    .map((child) => removePaneNode(child, paneId))
    .filter((child): child is SplitNode => child != null)

  if (nextChildren.length === 0) {
    return null
  }

  if (nextChildren.length === 1) {
    return nextChildren[0]
  }

  return {
    kind: 'branch',
    direction: root.direction,
    sizes: normalizeSizes(root.sizes, nextChildren.length),
    children: nextChildren
  }
}

function insertPaneNode(
  root: SplitNode,
  targetPaneId: string,
  position: Exclude<SplitDropPosition, 'center'>,
  sourcePaneId: string,
  nextSizes: number[]
): SplitNode {
  if (root.kind === 'pane') {
    if (root.paneId !== targetPaneId) {
      return { ...root }
    }

    const direction: SplitDirection =
      position === 'left' || position === 'right' ? 'horizontal' : 'vertical'

    const children =
      position === 'left' || position === 'top'
        ? [createPaneNode(sourcePaneId), { ...root }]
        : [{ ...root }, createPaneNode(sourcePaneId)]

    return createBranchNode(direction, children, nextSizes)
  }

  return {
    kind: 'branch',
    direction: root.direction,
    sizes: [...root.sizes],
    children: root.children.map((child) =>
      insertPaneNode(child, targetPaneId, position, sourcePaneId, nextSizes)
    )
  }
}

export function movePaneInTree(
  root: SplitNode,
  sourcePaneId: string,
  targetPaneId: string,
  position: SplitDropPosition,
  nextSizes = DEFAULT_BRANCH_SIZES
): SplitNode {
  if (sourcePaneId === targetPaneId) {
    return cloneSplitNode(root)
  }

  if (position === 'center') {
    return swapPaneIds(root, sourcePaneId, targetPaneId)
  }

  const prunedRoot = removePaneNode(root, sourcePaneId)
  if (!prunedRoot) {
    return cloneSplitNode(root)
  }

  return insertPaneNode(prunedRoot, targetPaneId, position, sourcePaneId, nextSizes)
}

export function updateBranchSizesAtPath(root: SplitNode, path: number[], sizes: number[]): SplitNode {
  if (root.kind === 'pane') {
    return { ...root }
  }

  if (path.length === 0) {
    return {
      kind: 'branch',
      direction: root.direction,
      sizes: normalizeSizes(sizes, root.children.length),
      children: root.children.map(cloneSplitNode)
    }
  }

  const [nextIndex, ...restPath] = path
  return {
    kind: 'branch',
    direction: root.direction,
    sizes: [...root.sizes],
    children: root.children.map((child, index) =>
      index === nextIndex ? updateBranchSizesAtPath(child, restPath, sizes) : cloneSplitNode(child)
    )
  }
}
