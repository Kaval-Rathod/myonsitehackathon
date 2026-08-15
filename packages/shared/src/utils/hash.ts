import * as crypto from 'crypto';

/**
 * Deterministically stringifies an object by sorting its keys recursively.
 */
export function canonicalize(obj: any): string {
  if (typeof obj !== 'object' || obj === null) {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalize(item)).join(',')}]`;
  }

  const keys = Object.keys(obj).sort();
  const canonicalObj: string[] = [];
  
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined) {
      canonicalObj.push(`"${key}":${canonicalize(value)}`);
    }
  }

  return `{${canonicalObj.join(',')}}`;
}

/**
 * Generates a SHA-256 hash of the canonically serialized object.
 */
export function generateHash(obj: any): string {
  const canonicalString = canonicalize(obj);
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}
