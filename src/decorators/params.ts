import "reflect-metadata";

export const ROUTE_ARGS_KEY = Symbol("route_args");

export type RouteArg =
  | { type: "body" }
  | { type: "param" | "query"; name: string };

export function Body(): ParameterDecorator {
  return createRouteArgDecorator("@Body()", { type: "body" });
}

export function Param(name: string): ParameterDecorator {
  return createRouteArgDecorator("@Param()", { type: "param", name });
}

export function Query(name: string): ParameterDecorator {
  return createRouteArgDecorator("@Query()", { type: "query", name });
}

export function getRouteArgs(
  target: object,
  propertyKey: string | symbol,
): ReadonlyMap<number, RouteArg> {
  return Reflect.getOwnMetadata(ROUTE_ARGS_KEY, target, propertyKey) ?? new Map();
}

function createRouteArgDecorator(
  decorator: string,
  arg: RouteArg,
): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    if (propertyKey === undefined) {
      throw new Error(
        `${decorator} is supported only on method parameters, ` +
          `got constructor parameter #${parameterIndex}`,
      );
    }

    const args = new Map(getRouteArgs(target, propertyKey));
    args.set(parameterIndex, arg);
    Reflect.defineMetadata(ROUTE_ARGS_KEY, args, target, propertyKey);
  };
}
