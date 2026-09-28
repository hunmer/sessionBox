import type { ExtensionContext } from '../context';
/** Bridges Electron session webRequest events to MV3 webRequest listeners. */
export declare class WebRequestAPI {
    private ctx;
    constructor(ctx: ExtensionContext);
}
