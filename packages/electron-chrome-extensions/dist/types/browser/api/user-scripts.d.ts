/// <reference types="chrome" />
import type { ExtensionContext } from '../context';
import type { ExtensionEvent } from '../router';
type UserScript = chrome.userScripts.RegisteredUserScript & {
    allFrames?: boolean;
    excludeGlobs?: string[];
    excludeMatches?: string[];
    includeGlobs?: string[];
    matches?: string[];
    runAt?: 'document_start' | 'document_end' | 'document_idle';
    world?: 'MAIN' | 'USER_SCRIPT';
    worldId?: string;
};
type WorldProperties = {
    csp?: string;
    messaging?: boolean;
    worldId?: string;
};
export type DocumentUserScript = {
    code: string;
    extensionId: string;
    runAt: 'document_start' | 'document_end' | 'document_idle';
    scriptId: string;
    world: 'MAIN' | 'USER_SCRIPT';
    worldCsp?: string;
    worldId: number;
    worldName: string;
    worldOrigin: string;
};
export type UserScriptsInitialization = {
    extensionId: string;
    scriptCount: number;
    state: 'registered' | 'restored' | 'timed-out';
};
export declare class UserScriptsAPI {
    private ctx;
    private scripts;
    private initializationWaiters;
    constructor(ctx: ExtensionContext);
    private getStorageFilePath;
    private readPersistedScripts;
    private persistExtension;
    private restoreExtension;
    private restoreLoadedExtensions;
    private observeExtensions;
    private getInitializationWaiter;
    private settleInitialization;
    private scheduleInitializationSettlement;
    waitForExtensionInitialization(extensionId: string, timeoutMs?: number): Promise<UserScriptsInitialization>;
    private installDocumentStartHandler;
    private getExtensionScripts;
    getDocumentScripts(url: string, topFrame: boolean): DocumentUserScript[];
    register: (event: ExtensionEvent, scripts: UserScript[]) => Promise<void>;
    unregister: (event: ExtensionEvent, details: {
        ids?: string[];
    }) => Promise<void>;
    update: (event: ExtensionEvent, scripts: UserScript[]) => Promise<void>;
    getScripts: (event: ExtensionEvent, filter?: {
        ids?: string[];
    }) => Promise<UserScript[]>;
    configureWorld: (event: ExtensionEvent, properties: WorldProperties) => Promise<void>;
}
export {};
