import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { Container } from "../src/container.js";
import { Inject } from "../src/decorators/inject.js";
import { Injectable } from "../src/decorators/injectable.js";
import { CONFIG } from "../src/tokens.js";

describe("Container", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe("scopes", () => {
    @Injectable()
    class SingletonService {}

    @Injectable({ scope: "transient" })
    class TransientService {}

    test("singleton (default scope) returns the same instance", () => {
      assert.equal(
        container.resolve(SingletonService),
        container.resolve(SingletonService),
      );
    });

    test("transient returns a new instance on every resolve", () => {
      assert.notEqual(
        container.resolve(TransientService),
        container.resolve(TransientService),
      );
    });
  });

  describe("recursive resolve", () => {
    @Injectable()
    class C {
      value = "from C";
    }

    @Injectable()
    class B {
      constructor(public c: C) {}
    }

    @Injectable()
    class A {
      constructor(public b: B) {}
    }

    test("resolves A -> B -> C with a live C inside", () => {
      const a = container.resolve(A);

      assert.ok(a.b instanceof B);
      assert.ok(a.b.c instanceof C);
      assert.equal(a.b.c.value, "from C");
    });
  });

  describe("@Inject(token)", () => {
    interface Config {
      apiUrl: string;
    }

    @Injectable()
    class ApiClient {
      constructor(@Inject(CONFIG) public config: Config) {}
    }

    test("resolves a dependency registered under Symbol.for('CONFIG') by token, not by type", () => {
      const config: Config = { apiUrl: "https://example.com" };
      container.register(Symbol.for("CONFIG"), { useValue: config });

      assert.deepEqual(Reflect.getMetadata("design:paramtypes", ApiClient), [
        Object,
      ]);
      assert.equal(container.resolve(ApiClient).config, config);
    });

    test("binds an interface token to an implementation via useClass", () => {
      interface Logger {
        log(message: string): string;
      }
      const LOGGER = Symbol("LOGGER");

      @Injectable()
      class ConsoleLogger implements Logger {
        log(message: string) {
          return `[console] ${message}`;
        }
      }

      @Injectable()
      class UserService {
        constructor(@Inject(LOGGER) public logger: Logger) {}
      }

      container.register(LOGGER, { useClass: ConsoleLogger });

      const service = container.resolve(UserService);
      assert.ok(service.logger instanceof ConsoleLogger);
      assert.equal(service.logger, container.resolve(ConsoleLogger));
    });

    test("throws a readable error when the token has no provider", () => {
      assert.throws(
        () => container.resolve(ApiClient),
        /Cannot resolve parameter #0 of ApiClient: no provider registered for token CONFIG/,
      );
    });

    test("throws when an interface parameter has no @Inject(token)", () => {
      @Injectable()
      class NoToken {
        constructor(public config: Config) {}
      }

      assert.throws(
        () => container.resolve(NoToken),
        /Object is not an @Injectable\(\) class\. Use @Inject\(token\)/,
      );
    });
  });

  describe("inheritance", () => {
    const TOKEN = Symbol("TOKEN");

    @Injectable()
    class Dep {}

    @Injectable({ scope: "transient" })
    class Parent {
      constructor(@Inject(TOKEN) public value: unknown) {}
    }

    test("a subclass without @Injectable() is not resolvable", () => {
      class Child extends Parent {}

      container.register(TOKEN, { useValue: "value" });

      assert.throws(
        () => container.resolve(Child),
        /Child is not marked as @Injectable\(\)/,
      );
    });

    test("a subclass with its own constructor does not inherit parent's @Inject tokens", () => {
      @Injectable()
      class Child extends Parent {
        constructor(public dep: Dep) {
          super(dep);
        }
      }

      container.register(TOKEN, { useValue: "value" });

      assert.ok(container.resolve(Child).dep instanceof Dep);
    });

    test("a subclass without its own constructor reuses parent's @Inject tokens", () => {
      @Injectable()
      class Child extends Parent {}

      container.register(TOKEN, { useValue: "value" });

      assert.equal(container.resolve(Child).value, "value");
    });
  });

  describe("circular dependencies", () => {
    @Injectable()
    class A {
      constructor(public b: unknown) {}
    }

    @Injectable()
    class B {
      constructor(public a: A) {}
    }

    Reflect.defineMetadata("design:paramtypes", [B], A);

    test("throws a readable error with the whole chain", () => {
      assert.throws(
        () => container.resolve(A),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(!(err instanceof RangeError));
          assert.match(err.message, /A -> B -> A/);
          return true;
        },
      );
    });
  });
});
