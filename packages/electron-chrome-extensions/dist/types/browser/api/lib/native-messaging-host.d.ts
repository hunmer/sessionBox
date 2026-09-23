import { ExtensionSender } from '../../router';
export declare class NativeMessagingHost {
    private process?;
    private sender?;
    private connectionId;
    private connected;
    private pending?;
    private keepAlive;
    private resolveResponse?;
    ready?: Promise<void>;
    constructor(extensionId: string, sender: ExtensionSender, connectionId: string, application: string, keepAlive?: boolean);
    destroy(): void;
    private launch;
    private receiveExtensionMessage;
    private send;
    private receive;
    sendAndReceive(message: any): Promise<unknown>;
}
