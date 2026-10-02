export type Constructor<T = unknown> = new (...args: any[]) => T;

export type InjectionToken<T = unknown> = Constructor<T> | string | symbol;

export const CONFIG = Symbol.for("CONFIG");

export function tokenName(token: unknown): string {
  if (typeof token === "function") return token.name;
  if (typeof token === "symbol") return token.description ?? String(token);
  return String(token);
}
