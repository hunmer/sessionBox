/** Single split pane — maps to one visible WebContentsView */
export interface SplitPane {
  id: string
  activeTabId: string | null
  order: number
}

/** Preset split layout types */
export type SplitPresetType = '1' | '2h' | '2v' | '3' | '4'

/** Runtime split layout state (one per workspace) */
export interface SplitLayout {
  presetType: SplitPresetType | 'custom'
  panes: SplitPane[]
  direction: 'horizontal' | 'vertical'
  sizes: number[]
}

/** Persisted custom split scheme (saved by user) */
export interface SavedSplitScheme {
  id: string
  name: string
  presetType: SplitPresetType
  direction: 'horizontal' | 'vertical'
  paneCount: number
  sizes: number[]
}

/** Bounds payload for multi-view update */
export interface PaneBounds {
  tabId: string
  rect: { x: number; y: number; width: number; height: number }
}
