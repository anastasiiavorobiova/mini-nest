import "reflect-metadata";

export const ROUTES_KEY = Symbol("routes");

export type HttpMethod = "GET" | "POST";

export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  handler: string | symbol;
}

export const Get = createRouteDecorator("@Get()", "GET");
export const Post = createRouteDecorator("@Post()", "POST");

export function getRoutes(controller: Function): readonly RouteDefinition[] {
  return Reflect.getMetadata(ROUTES_KEY, controller) ?? [];
}

function createRouteDecorator(decorator: string, method: HttpMethod) {
  return (path = ""): MethodDecorator =>
    (target, handler) => {
      if (typeof target === "function") {
        throw new Error(
          `${decorator} is supported only on instance methods, ` +
            `got static ${target.name}.${String(handler)}()`,
        );
      }

      const controller = target.constructor;
      const routes = [...getRoutes(controller), { method, path, handler }];
      Reflect.defineMetadata(ROUTES_KEY, routes, controller);
    };
}
