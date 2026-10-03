import type { components } from "@tekpas/api-client";
import { describe, expectTypeOf, it } from "vitest";
import type { BatchStatus, Fiber, FieldErrorCode, ProductCategory } from "./constants";

type Schemas = components["schemas"];

/**
 * The runtime lists here must match the API. These checks run in `pnpm typecheck`: when a backend enum
 * changes and the client is regenerated, a stale list here fails the build.
 */
describe("constants match the generated API client", () => {
  it("enums", () => {
    expectTypeOf<Fiber>().toEqualTypeOf<Schemas["Fiber"]>();
    expectTypeOf<ProductCategory>().toEqualTypeOf<Schemas["ProductCategory"]>();
    expectTypeOf<BatchStatus>().toEqualTypeOf<Schemas["BatchStatus"]>();
  });

  it("error codes are plain strings in the API", () => {
    expectTypeOf<FieldErrorCode>().toExtend<Schemas["FieldViolation"]["code"]>();
  });
});
