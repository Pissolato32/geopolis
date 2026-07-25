/**
 * Custom JSON replacer converting BigInt to object representation for safe JSON.stringify.
 */
export declare function bigintJsonReplacer(_key: string, value: unknown): unknown;
/**
 * Custom JSON reviver restoring BigInt objects back to native BigInt values.
 */
export declare function bigintJsonReviver(_key: string, value: unknown): unknown;
//# sourceMappingURL=bigint-json.d.ts.map