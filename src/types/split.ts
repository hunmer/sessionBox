/** Single split pane — maps to one visible WebContentsView */
export interface SplitPane {
  id: string
  activeTabId: string | null
  order: number
}

/** Preset split layout types */
export type SplitPresetType = '1' | '2h' | '2v' | '3' | '4'
export type SplitLayoutType = SplitPresetType | 'custom'
export type SplitDirection = 'horizontal' | 'vertical'
export type SplitDropPosition = 'top' | 'bottom' | 'left' | 'right' | 'center'

/** Runtime split tree leaf */
export interface SplitLeafNode {
  kind: 'pane'
  paneId: string
}

/** Runtime split tree branch */
export interface SplitBranchNode {
  kind: 'branch'
  direction: SplitDirection
  sizes: number[]
  children: SplitNode[]
}

/** Runtime split tree node */
export type SplitNode = SplitLeafNode | SplitBranchNode

/** Runtime split layout state (one per workspace) */
export interface SplitLayout {
  presetType: SplitLayoutType
  panes: SplitPane[]
  direction: SplitDirection
  sizes: number[]
  root: SplitNode
}

/** Persisted custom split scheme (saved by user) */
export interface SavedSplitScheme {
  id: string
  name: string
  presetType: SplitLayoutType
  direction: SplitDirection
  paneCount: number
  sizes: number[]
  root?: SplitNode
}

/** Bounds payload for multi-view update */
export interface PaneBounds {
  tabId: string
  rect: { x: number; y: number; width: number; height: number }
}
