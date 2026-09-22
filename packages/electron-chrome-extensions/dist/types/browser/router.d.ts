/// <reference types="chrome" />
export type IpcEvent = Electron.IpcMainEvent | Electron.IpcMainServiceWorkerEvent;
export type IpcInvokeEvent = Electron.IpcMainInvokeEvent | Electron.IpcMainServiceWorkerInvokeEvent;
export type IpcAnyEvent = IpcEvent | IpcInvokeEvent;
interface RoutingDelegateObserver {
    session: Electron.Session;
    onExtensionMessage(event: Electron.IpcMainInvokeEvent, extensionId: string | undefined, handlerName: string, ...args: any[]): Promise<void>;
    addListener(listener: EventListener, extensionId: string, eventName: string): void;
    removeListener(listener: EventListener, extensionId: string, eventName: string): void;
}
/**
 * Handles event routing IPCs and delivers them to the observer with the
 * associated session.
 */
declare class RoutingDelegate {
    static get(): RoutingDelegate;
    private sessionMap;
    private workers;
    private constructor();
    addObserver(observer: RoutingDelegateObserver): void;
    private onRouterMessage;
    private onRemoteMessage;
    private onAddListener;
    private onRemoveListener;
}
export type ExtensionSender = Electron.WebContents | Electron.ServiceWorkerMain;
type ExtendedExtension = Omit<Electron.Extension, 'manifest'> & {
    manifest: chrome.runtime.Manifest;
};
export type ExtensionEvent = {
    type: 'frame';
    sender: Electron.WebContents;
    extension: ExtendedExtension;
} | {
    type: 'service-worker';
    sender: Electron.ServiceWorkerMain;
    extension: ExtendedExtension;
};
export type HandlerCallback = (event: ExtensionEvent, ...args: any[]) => any;
export interface HandlerOptions {
    /** Whether the handler can be invoked on behalf of a different session. */
    allowRemote?: boolean;
    /** Whether an extension context is required to invoke the handler. */
    extensionContext: boolean;
    /** Required extension permission to run the handler. */
    permission?: chrome.runtime.ManifestPermissions;
}
type FrameEventListener = {
    type: 'frame';
    host: Electron.WebContents;
    extensionId: string;
};
type SWEventListener = {
    type: 'service-worker';
    extensionId: string;
};
type EventListener = FrameEventListener | SWEventListener;
export declare class ExtensionRouter {
    session: Electron.Session;
    private delegate;
    private handlers;
    private listeners;
    /**
     * Collection of all extension hosts in the session.
     *
     * Currently the router has no ability to wake up non-persistent background
     * scripts to deliver events. For now we just hold a reference to them to
     * prevent them from being terminated.
     */
    private extensionHosts;
    private extensionWorkers;
    constructor(session: Electron.Session, delegate?: RoutingDelegate);
    private filterListeners;
    private observeListenerHost;
    addListener(listener: EventListener, extensionId: string, eventName: string): void;
    removeListener(listener: EventListener, extensionId: string, eventName: string): void;
    private getHandler;
    onExtensionMessage(event: IpcInvokeEvent, extensionId: string | undefined, handlerName: string, ...args: any[]): Promise<any>;
    private handle;
    /** Returns a callback to register API handlers for the given context. */
    apiHandler(): (name: string, callback: HandlerCallback, opts?: Partial<HandlerOptions>) => void;
    /**
     * Sends extension event to the host for the given extension ID if it
     * registered a listener for it.
     */
    sendEvent(targetExtensionId: string | undefined, eventName: string, ...args: any[]): void;
    /** Broadcasts extension event to all extension hosts listening for it. */
    broadcastEvent(eventName: string, ...args: any[]): void;
}
export {};
