type SessionPartitionResolver = (partition: string) => Electron.Session;
/**
 * Overrides the default `session.fromPartition()` behavior for retrieving Electron Sessions.
 * This allows using custom identifiers (e.g., profile IDs) to find sessions, enabling features like
 * `<browser-actions>` to work with non-standard session management schemes.
 * @param handler A function that receives a string identifier and returns the corresponding Electron `Session`.
 */
export declare function setSessionPartitionResolver(resolver: SessionPartitionResolver): void;
export declare function resolvePartition(partition: string): Electron.Session;
export {};
