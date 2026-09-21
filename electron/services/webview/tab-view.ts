import type { BrowserWindow, WebContents, WebContentsView } from 'electron'

export interface TabViewBounds {
  x: number
  y: number
  width: number
  height: number
}

/** 两种标签页宿主共用的最小生命周期契约。 */
export abstract class BaseTabView {
  constructor(
    public readonly tabId: string,
    public readonly webContents: WebContents
  ) {}

  abstract setVisible(visible: boolean): void
  abstract setBounds(bounds: TabViewBounds): void
  abstract destroy(): void
}

export class BrowserContentTabView extends BaseTabView {
  constructor(
    tabId: string,
    private readonly view: WebContentsView,
    private readonly mainWindow: BrowserWindow
  ) {
    super(tabId, view.webContents)
    mainWindow.contentView.addChildView(view)
  }

  setVisible(visible: boolean): void {
    this.view.setVisible(visible)
  }

  setBounds(bounds: TabViewBounds): void {
    this.view.setBounds(bounds)
  }

  destroy(): void {
    if (!this.mainWindow.isDestroyed()) {
      this.view.setVisible(false)
      this.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      this.mainWindow.contentView.removeChildView(this.view)
    }
    if (!this.webContents.isDestroyed()) this.webContents.close()
  }
}

export class WebviewTabView extends BaseTabView {
  constructor(
    tabId: string,
    webContents: WebContents,
    private readonly mainWindow: BrowserWindow
  ) {
    super(tabId, webContents)
  }

  setVisible(visible: boolean): void {
    this.send('on:tab-webview:set-visible', { tabId: this.tabId, visible })
  }

  setBounds(bounds: TabViewBounds): void {
    this.send('on:tab-webview:set-bounds', { tabId: this.tabId, bounds })
  }

  destroy(): void {
    this.send('on:tab-webview:destroy', { tabId: this.tabId })
  }

  private send(channel: string, payload: unknown): void {
    if (!this.mainWindow.isDestroyed()) this.mainWindow.webContents.send(channel, payload)
  }
}
