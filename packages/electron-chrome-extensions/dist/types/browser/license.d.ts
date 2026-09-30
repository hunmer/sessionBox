declare const VALID_LICENSES_CONST: readonly ["GPL-3.0", "Patron-License-2020-11-19"];
export type License = (typeof VALID_LICENSES_CONST)[number];
/**
 * Check to ensure a valid license is provided.
 * @see LICENSE.md
 */
export declare function checkLicense(license?: unknown): void;
export {};
