/**
 * Custom JSON replacer converting BigInt to object representation for safe JSON.stringify.
 */
export function bigintJsonReplacer(_key, value) {
    if (typeof value === 'bigint') {
        return { $bigint: value.toString() };
    }
    return value;
}
/**
 * Custom JSON reviver restoring BigInt objects back to native BigInt values.
 */
export function bigintJsonReviver(_key, value) {
    if (value && typeof value === 'object' && '$bigint' in value) {
        return BigInt(value.$bigint);
    }
    return value;
}
//# sourceMappingURL=bigint-json.js.map