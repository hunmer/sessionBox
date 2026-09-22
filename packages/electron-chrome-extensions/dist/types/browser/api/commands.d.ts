import { ExtensionContext } from '../context';
export declare class CommandsAPI {
    private ctx;
    private commandMap;
    constructor(ctx: ExtensionContext);
    private processExtension;
    private removeCommands;
    private getAll;
}
