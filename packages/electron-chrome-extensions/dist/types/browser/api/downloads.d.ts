import { ExtensionContext } from '../context';
/** Bridges Chrome downloads APIs to Electron Session.downloadURL and DownloadItem. */
export declare class DownloadsAPI {
    private ctx;
    private nextId;
    private pending;
    private records;
    constructor(ctx: ExtensionContext);
    private download;
    private onWillDownload;
    private getFilename;
    private toChromeItem;
    private getRecord;
    private cancel;
    private pause;
    private resume;
    private removeFile;
    private open;
    private show;
    private showDefaultFolder;
    private acceptDanger;
    private getFileIcon;
    private search;
    private erase;
}
