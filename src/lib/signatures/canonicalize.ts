/**
 * RFC 8785 (JSON Canonicalization Scheme) serialization + SHA-256 hashing.
 * Client-safe: used by the signature capture UI to hash a record, and by the
 * server verification path to recompute the hash before accepting a signature.
 *
 * Supported subset: plain JSON data (objects, arrays, strings, finite numbers,
 * booleans, null). Undefined, functions, symbols, and non-finite numbers throw.
 */

function canonicalizeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("RFC 8785: non-finite numbers are not allowed");
  }
  if (Number.isInteger(value) && Math.abs(value) < Number.MAX_SAFE_INTEGER) {
    return value.toString();
  }
  // ECMAScript Number::toString per RFC 8785 section 3.2.2.3
  return JSON.stringify(value);
}

function canonicalizeString(value: string): string {
  // JSON string escaping matches RFC 8785 string rules
  return JSON.stringify(value);
}

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return canonicalizeNumber(value);
    case "string":
      return canonicalizeString(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalize(item)).join(",")}]`;
      }
      const entries = Object.keys(value as Record<string, unknown>)
        .sort() // UTF-16 code unit ordering per RFC 8785
        .map((key) => {
          const v = (value as Record<string, unknown>)[key];
          if (v === undefined) {
            throw new Error(`RFC 8785: undefined value for key "${key}"`);
          }
          return `${canonicalizeString(key)}:${canonicalize(v)}`;
        });
      return `{${entries.join(",")}}`;
    }
    default:
      throw new Error(`RFC 8785: unsupported type "${typeof value}"`);
  }
}

export async function canonicalSha256(value: unknown): Promise<string> {
  const canonical = canonicalize(value);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
