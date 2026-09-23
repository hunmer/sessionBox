/// <reference types="node" />
import { EventEmitter } from 'node:events';
import { ExtensionContext } from '../context';
export declare class RuntimeAPI extends EventEmitter {
    private ctx;
    private hostMap;
    private ports;
    private observedPortSenders;
    private userScriptMessageSenders;
    private pendingInstallEvents;
    private installEventTimer?;
    constructor(ctx: ExtensionContext);
    private handleUserScriptMessageResponse;
    private getInstallStatePath;
    private readInstallState;
    private writeInstallState;
    private trackInstalledExtension;
    private scheduleInstallEventDelivery;
    private connectNative;
    private disconnectNative;
    private sendNativeMessage;
    private openOptionsPage;
    private sendMessage;
    private connectPort;
    private portPostMessage;
    private disconnectPort;
}
