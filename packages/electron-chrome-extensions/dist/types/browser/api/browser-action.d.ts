import { ExtensionContext } from '../context';
export declare class BrowserActionAPI {
    private ctx;
    private actionMap;
    private popup?;
    private observers;
    private queuedUpdate;
    private panelBehaviors;
    private panelOptions;
    constructor(ctx: ExtensionContext);
    private setupSession;
    handleCRXRequest(request: GlobalRequest): GlobalResponse;
    private getAction;
    removeActions(extensionId: string): void;
    private getPopupUrl;
    processExtension(extension: Electron.Extension): void;
    private getState;
    private activate;
    private activateClick;
    private setPanelBehavior;
    private getPanelBehavior;
    private setPanelOptions;
    private activateContextMenu;
    private openPopup;
    private onUpdate;
}
