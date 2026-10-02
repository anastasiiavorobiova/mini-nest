import "reflect-metadata";
import { getInjectTokens } from "./decorators/inject.js";
import { getInjectableOptions } from "./decorators/injectable.js";
import { type Constructor, type InjectionToken, tokenName } from "./tokens.js";

export type Provider<T = unknown> =
  | { useValue: T }
  | { useClass: Constructor<T> };

export class Container {
  private providers = new Map<InjectionToken, Provider>();
  private singletons = new Map<Constructor, unknown>();

  register<T>(token: InjectionToken<T>, provider: Provider<T>): this {
    this.providers.set(token, provider);
    return this;
  }

  resolve<T>(token: InjectionToken<T>): T {
    return this.resolveToken(token, new Set());
  }

  private resolveToken<T>(
    token: InjectionToken<T>,
    path: ReadonlySet<Constructor>,
  ): T {
    const provider = this.providers.get(token) as Provider<T> | undefined;

    if (provider) {
      return "useValue" in provider
        ? provider.useValue
        : this.resolveClass(provider.useClass, path);
    }

    if (typeof token === "function") {
      return this.resolveClass(token, path);
    }

    throw new Error(`No provider registered for token ${tokenName(token)}`);
  }

  private resolveClass<T>(
    target: Constructor<T>,
    path: ReadonlySet<Constructor>,
  ): T {
    if (path.has(target)) {
      const chain = [...path, target].map((cls) => cls.name).join(" -> ");
      throw new Error(`Circular dependency detected: ${chain}`);
    }

    const options = getInjectableOptions(target);

    if (!options) {
      throw new Error(`${target.name} is not marked as @Injectable()`);
    }

    if (options.scope === "singleton" && this.singletons.has(target)) {
      return this.singletons.get(target) as T;
    }

    const { paramTypes, injectTokens } = this.getConstructorParams(target);

    const nextPath = new Set(path).add(target);

    const deps = paramTypes.map((type, index) => {
      const injectToken = injectTokens.get(index);
      const token = injectToken ?? type;

      if (!this.canResolve(token)) {
        const reason =
          injectToken !== undefined
            ? `no provider registered for token ${tokenName(injectToken)}`
            : `${tokenName(type)} is not an @Injectable() class. ` +
              `Use @Inject(token) for interfaces and primitives`;
        throw new Error(
          `Cannot resolve parameter #${index} of ${target.name}: ${reason}`,
        );
      }
      return this.resolveToken(token, nextPath);
    });

    const instance = new target(...deps);

    if (options.scope === "singleton") {
      this.singletons.set(target, instance);
    }
    return instance;
  }

  private getConstructorParams(target: Constructor): {
    paramTypes: unknown[];
    injectTokens: ReadonlyMap<number, InjectionToken>;
  } {
    for (
      let cls: Function | null = target;
      cls && cls !== Function.prototype;
      cls = Object.getPrototypeOf(cls)
    ) {
      if (Reflect.hasOwnMetadata("design:paramtypes", cls)) {
        return {
          paramTypes: Reflect.getOwnMetadata("design:paramtypes", cls),
          injectTokens: getInjectTokens(cls),
        };
      }
    }
    return { paramTypes: [], injectTokens: new Map() };
  }

  private canResolve(token: unknown): token is InjectionToken {
    if (this.providers.has(token as InjectionToken)) return true;
    return typeof token === "function" && !!getInjectableOptions(token);
  }
}
