import { ExtensionContext } from './context';
export declare function readUrlOverrides(ctx: ExtensionContext, extension: Electron.Extension): Promise<void>;
export declare function readLoadedExtensionManifest(ctx: ExtensionContext, extension: Electron.Extension): void;
