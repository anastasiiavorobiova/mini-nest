import "reflect-metadata";

export type Scope = "singleton" | "transient";

const INJECTABLE_KEY = Symbol("injectable");

export interface InjectableOptions {
  scope?: Scope;
}

export function Injectable(options: InjectableOptions = {}): ClassDecorator {
  return (target: Function) => {
    Reflect.defineMetadata(
      INJECTABLE_KEY,
      { scope: options.scope ?? "singleton" },
      target,
    );
  };
}

export function getInjectableOptions(
  target: Function,
): Required<InjectableOptions> | undefined {
  return Reflect.getOwnMetadata(INJECTABLE_KEY, target);
}
