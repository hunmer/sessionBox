# RightPanel Mini Popover Design

## Overview

Add mini Popover panels to the right sidebar's bookmark, history, and download buttons. Clicking a button shows a compact popover with condensed information instead of immediately opening a full page. Each Popover header includes a "View All" link that opens the corresponding full page tab.

## Components

### New Files

| File | Purpose |
|------|---------|
| `src/components/common/BookmarkMiniPopover.vue` | Recent bookmarks with scrollable list |
| `src/components/common/HistoryMiniPopover.vue` | Recent history with scrollable list |
| `src/components/common/DownloadMiniPopover.vue` | Download task overview with scrollable list |

### Modified Files

| File | Change |
|------|--------|
| `src/components/common/RightPanel.vue` | Replace Tooltip with Popover, integrate three MiniPopover components |

## Interaction

- **Trigger**: Click icon button to open Popover (left side)
- **Dismiss**: Click outside Popover area
- **Item click**: Bookmark/History items open URL in new tab; Download items open file
- **View All**: Header link closes Popover and opens full page (`sessionbox://bookmarks`, `sessionbox://history`, `sessionbox://downloads`)

## Popover Layout

Each Popover shares the same structure:

```
+----------------------------------+
| [Title]           [View All ->]  |  <- Header
|----------------------------------|
|                                  |
|  [Item 1]                        |
|  [Item 2]                        |  <- ScrollArea (max-h ~400px)
|  [Item 3]                        |
|  ...                             |
|                                  |
|----------------------------------|
| Total: N items                   |  <- Footer (optional)
+----------------------------------+
```

Width: ~320px, max height ~400px with ScrollArea.

## Data Sources

| Popover | Source | Loading |
|---------|--------|---------|
| Bookmark | `bookmarkStore.bookmarks` (sorted by recency, top N) | Reactive, no async needed |
| History | `historyStore.getRecentHistory()` | Async, load on popover open |
| Download | `downloadStore.allTasks` (sorted by recency) | Reactive from store |

## Component Details

### BookmarkMiniPopover

- Each item: favicon + title (truncated) + domain
- Click item: `tabStore.createTabForSite(url)`
- Footer: total bookmark count

### HistoryMiniPopover

- Each item: title (truncated) + domain + time (HH:mm)
- Click item: `tabStore.createTabForSite(url)`
- Footer: total recent entry count

### DownloadMiniPopover

- Each item: filename (truncated) + status badge + size or progress
- If not connected to Aria2: show "Not connected" message
- Footer: task count by status

## Style

- Use existing shadcn Popover component
- Side: `left` (popover appears to the left of trigger button)
- Consistent with project's Tailwind + CSS variable theme system
