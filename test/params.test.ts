import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Controller } from "../src/decorators/controller.js";
import { Get } from "../src/decorators/methods.js";
import { Param, Query, getRouteArgs } from "../src/decorators/params.js";

describe("@Param / @Query", () => {
  @Controller("users")
  class UsersController {
    @Get(":id")
    findOne(
      @Param("id") id: string,
      @Query("fields") fields: string,
      @Query("expand") expand: string,
    ) {
      return { id, fields, expand };
    }

    @Get()
    findAll(@Query("limit") limit: string) {
      return { limit };
    }

    @Get("health")
    health() {
      return "ok";
    }
  }

  const prototype = UsersController.prototype;

  test("@Param(name) records the parameter index and the route param name", () => {
    assert.deepEqual(getRouteArgs(prototype, "findOne").get(0), {
      type: "param",
      name: "id",
    });
  });

  test("@Query(name) records the parameter index and the query key", () => {
    assert.deepEqual(
      [...getRouteArgs(prototype, "findAll")],
      [[0, { type: "query", name: "limit" }]],
    );
  });

  test("args are keyed by parameter index, not by decorator execution order", () => {
    const args: string[] = [];
    for (const [index, arg] of getRouteArgs(prototype, "findOne")) {
      args[index] = arg.type === "body" ? "body" : `${arg.type}:${arg.name}`;
    }

    assert.deepEqual(args, ["param:id", "query:fields", "query:expand"]);
  });

  test("metadata is stored per method and does not leak between handlers", () => {
    assert.equal(getRouteArgs(prototype, "findOne").size, 3);
    assert.equal(getRouteArgs(prototype, "findAll").size, 1);
    assert.equal(getRouteArgs(prototype, "health").size, 0);
  });

  test("@Param() and @Query() on a constructor parameter throw a readable error", () => {
    assert.throws(() => {
      class WithParam {
        constructor(@Param("id") public id: string) {}
      }
      return WithParam;
    }, /@Param\(\) is supported only on method parameters, got constructor parameter #0/);

    assert.throws(() => {
      class WithQuery {
        constructor(@Query("limit") public limit: string) {}
      }
      return WithQuery;
    }, /@Query\(\) is supported only on method parameters, got constructor parameter #0/);
  });
});
