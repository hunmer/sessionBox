import type { Page } from '@/types'

// 侧边栏页面树节点（视图模型）：数据层只存 parentId，不存 children，
// 渲染时由子页面通过 parentId 认领父级组装成树
export interface PageItem {
  page: Page
  id: string
  name: string
  emoji: string
  url: string
  children: PageItem[]
}

export function toPageItem(page: Page): PageItem {
  return {
    page,
    id: page.id,
    name: page.name,
    emoji: page.icon || '',
    url: page.url,
    children: [],
  }
}

/**
 * 由扁平页面列表（含 parentId）组装树：
 * - parentId 缺失或指向组外页面时视为顶层
 * - 各层内部按 order 排序
 * - 环引用防护：认领会形成环的页面按顶层处理
 */
export function buildPageTree(pages: Page[]): PageItem[] {
  const sorted = [...pages].sort((a, b) => a.order - b.order)
  const nodes = new Map<string, PageItem>()
  for (const page of sorted) {
    nodes.set(page.id, toPageItem(page))
  }

  const roots: PageItem[] = []
  for (const page of sorted) {
    const node = nodes.get(page.id)!
    const parent = page.parentId ? nodes.get(page.parentId) : undefined
    if (parent && !wouldCycle(nodes, page)) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

function wouldCycle(nodes: Map<string, PageItem>, page: Page): boolean {
  let cursor = page.parentId
  const seen = new Set<string>([page.id])
  while (cursor) {
    if (seen.has(cursor)) return true
    seen.add(cursor)
    cursor = nodes.get(cursor)?.page.parentId
  }
  return false
}

/** 展平树（折叠态侧边栏下拉等场景需要平铺展示所有页面），带层级深度便于缩进 */
export function flattenPageItems(items: PageItem[], depth = 0): { item: PageItem; depth: number }[] {
  const result: { item: PageItem; depth: number }[] = []
  for (const item of items) {
    result.push({ item, depth })
    result.push(...flattenPageItems(item.children, depth + 1))
  }
  return result
}
