/**
 * Custom JSON replacer converting BigInt to object representation for safe JSON.stringify.
 */
export function bigintJsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { $bigint: value.toString() };
  }
  return value;
}

/**
 * Custom JSON reviver restoring BigInt objects back to native BigInt values.
 */
export function bigintJsonReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && '$bigint' in (value as Record<string, unknown>)) {
    return BigInt((value as { $bigint: string }).$bigint);
  }
  return value;
}
