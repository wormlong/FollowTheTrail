declare module 'bun:test' {
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;

  export interface Matchers<T = unknown> {
    toBe(expected: T): void;
    toEqual(expected: T): void;
    toBeGreaterThan(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeCloseTo(expected: number, numDigits?: number): void;
    toContain(expected: string): void;
    toBeNull(): void;
    not: Matchers<T>;
  }

  export function expect<T>(actual: T): Matchers<T>;
}
