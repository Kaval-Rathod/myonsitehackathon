import { canonicalize, generateHash } from '../src/utils/hash';

describe('Deterministic Hashing', () => {
  it('canonicalizes objects with different key orders to the same string', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { b: 2, a: 1 };

    expect(canonicalize(obj1)).toBe(canonicalize(obj2));
  });

  it('generates the same hash for objects with different key orders', () => {
    const obj1 = {
      event_id: '123',
      data: { z: 1, a: 2 },
      timestamp: '2023-01-01',
    };
    const obj2 = {
      timestamp: '2023-01-01',
      event_id: '123',
      data: { a: 2, z: 1 },
    };

    expect(generateHash(obj1)).toBe(generateHash(obj2));
  });

  it('generates different hashes for different objects', () => {
    const obj1 = { a: 1 };
    const obj2 = { a: 2 };

    expect(generateHash(obj1)).not.toBe(generateHash(obj2));
  });
});
