import { ExtensionContext } from '../context';
/**
 * This is a very basic implementation of the permissions API. Likely
 * more work will be needed to integrate with the native permissions.
 */
export declare class PermissionsAPI {
    private ctx;
    private permissionMap;
    constructor(ctx: ExtensionContext);
    private processExtension;
    private contains;
    private getAll;
    private remove;
    private request;
}
