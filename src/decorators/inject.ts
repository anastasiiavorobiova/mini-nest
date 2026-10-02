import "reflect-metadata";
import type { InjectionToken } from "../tokens.js";

const INJECT_KEY = Symbol("inject");

export function Inject(token: InjectionToken): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    if (propertyKey !== undefined) {
      throw new Error(
        `@Inject() is supported only on constructor parameters, ` +
          `got ${String(propertyKey)}() parameter #${parameterIndex}`,
      );
    }

    const tokens = new Map(getInjectTokens(target as Function));
    tokens.set(parameterIndex, token);
    Reflect.defineMetadata(INJECT_KEY, tokens, target);
  };
}

export function getInjectTokens(
  target: Function,
): ReadonlyMap<number, InjectionToken> {
  return Reflect.getOwnMetadata(INJECT_KEY, target) ?? new Map();
}
