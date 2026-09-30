/// <reference types="node" />
import { EventEmitter } from 'node:events';
import { BrowserWindow, Session } from 'electron';
export interface PopupAnchorRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
interface PopupViewOptions {
    extensionId: string;
    session: Session;
    parent: Electron.BaseWindow;
    url: string;
    anchorRect: PopupAnchorRect;
    alignment?: string;
}
export declare class PopupView extends EventEmitter {
    static POSITION_PADDING: number;
    static BOUNDS: {
        minWidth: number;
        minHeight: number;
        maxWidth: number;
        maxHeight: number;
    };
    browserWindow?: BrowserWindow;
    parent?: Electron.BaseWindow;
    extensionId: string;
    private anchorRect;
    private destroyed;
    private hidden;
    private alignment?;
    private initialSizeApplied;
    private pendingPreferredSize?;
    private preferredSizeTimer?;
    /** Preferred size changes are only received in Electron v12+ */
    private usingPreferredSize;
    private readyPromise;
    constructor(opts: PopupViewOptions);
    private show;
    private load;
    destroy: () => void;
    isDestroyed(): boolean;
    /** Resolves when the popup finishes loading. */
    whenReady(): Promise<void>;
    setSize(rect: Partial<Electron.Rectangle>): void;
    private maybeClose;
    private updatePosition;
    /** Backwards compat for Electron <12 */
    private queryPreferredSize;
    private updatePreferredSize;
}
export {};
