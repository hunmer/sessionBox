import type { ViewEntry } from './types'
import { getZoomPreference, setZoomPreference } from '../store'

export function getZoomLevel(entry: ViewEntry | undefined): number {
  if (!entry || entry.view.webContents.isDestroyed()) return 0
  return entry.view.webContents.getZoomLevel()
}

export function zoomIn(entry: ViewEntry | undefined, save: (tabId: string, level: number) => void): void {
  if (!entry || entry.view.webContents.isDestroyed()) return
  const currentZoom = entry.view.webContents.getZoomLevel()
  const step = 0.5
  const newZoom = Math.round(Math.min(currentZoom + step, 7) * 100) / 100
  entry.view.webContents.setZoomLevel(newZoom)
  save(entry.tabId, newZoom)
}

export function zoomOut(entry: ViewEntry | undefined, save: (tabId: string, level: number) => void): void {
  if (!entry || entry.view.webContents.isDestroyed()) return
  const currentZoom = entry.view.webContents.getZoomLevel()
  const step = 0.5
  const newZoom = Math.round(Math.max(currentZoom - step, -3) * 100) / 100
  entry.view.webContents.setZoomLevel(newZoom)
  save(entry.tabId, newZoom)
}

export function zoomReset(entry: ViewEntry | undefined, save: (tabId: string, level: number) => void): void {
  if (!entry || entry.view.webContents.isDestroyed()) return
  entry.view.webContents.setZoomLevel(0)
  save(entry.tabId, 0)
}

export function saveZoomPreference(entry: ViewEntry | undefined): void {
  if (!entry) return
  setZoomPreference(entry.pageId, entry.view.webContents.getZoomLevel())
}

export function restoreZoomLevel(entry: ViewEntry | undefined): void {
  if (!entry || entry.view.webContents.isDestroyed()) return
  const savedZoom = getZoomPreference(entry.pageId)
  if (savedZoom !== undefined && savedZoom !== 0) {
    entry.view.webContents.setZoomLevel(savedZoom)
  }
}
