/// <reference types="chrome" />
/// <reference types="node" />
import { EventEmitter } from 'node:events';
import { ContextMenuType } from './api/common';
import { ChromeExtensionImpl } from './impl';
import { ExtensionEvent } from './router';
export declare class ExtensionStore extends EventEmitter {
    impl: ChromeExtensionImpl;
    /** Tabs observed by the extensions system. */
    tabs: Set<Electron.WebContents>;
    /** Windows observed by the extensions system. */
    windows: Set<Electron.BaseWindow>;
    lastFocusedWindowId?: number;
    /**
     * Map of tabs to their parent window.
     *
     * It's not possible to access the parent of a BrowserView so we must manage
     * this ourselves.
     */
    tabToWindow: WeakMap<Electron.WebContents, Electron.BaseWindow>;
    /** Map of windows to their active tab. */
    private windowToActiveTab;
    tabDetailsCache: Map<number, Partial<chrome.tabs.Tab>>;
    windowDetailsCache: Map<number, Partial<chrome.windows.Window>>;
    urlOverrides: Record<string, string>;
    constructor(impl: ChromeExtensionImpl);
    getWindowById(windowId: number): Electron.BaseWindow | undefined;
    getLastFocusedWindow(): Electron.BaseWindow | null | undefined;
    getCurrentWindow(): Electron.BaseWindow | null | undefined;
    addWindow(window: Electron.BaseWindow): void;
    createWindow(event: ExtensionEvent, details: chrome.windows.CreateData): Promise<Electron.BaseWindow>;
    removeWindow(window: Electron.BaseWindow): Promise<void>;
    getTabById(tabId: number): Electron.WebContents | undefined;
    addTab(tab: Electron.WebContents, window: Electron.BaseWindow): void;
    removeTab(tab: Electron.WebContents): void;
    createTab(details: chrome.tabs.CreateProperties): Promise<Electron.WebContents>;
    getActiveTabFromWindow(win: Electron.BaseWindow): Electron.WebContents | undefined;
    getActiveTabFromWebContents(wc: Electron.WebContents): Electron.WebContents | undefined;
    getActiveTabOfCurrentWindow(): Electron.WebContents | undefined;
    setActiveTab(tab: Electron.WebContents): void;
    buildMenuItems(extensionId: string, menuType: ContextMenuType): Electron.MenuItem[];
    requestPermissions(extension: Electron.Extension, permissions: chrome.permissions.Permissions): Promise<boolean>;
}
