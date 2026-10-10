import type { components } from "@tekpas/api-client";
import { describe, expectTypeOf, it } from "vitest";
import type {
  BatchStatus,
  ChemicalStandard,
  DyeProcess,
  EnergySource,
  Fiber,
  FieldErrorCode,
  ProductCategory,
  StepStatus,
  StepType,
  SupplierType,
  YarnProcess,
} from "./constants";

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
    expectTypeOf<StepType>().toEqualTypeOf<Schemas["StepType"]>();
    expectTypeOf<StepStatus>().toEqualTypeOf<Schemas["StepStatus"]>();
    expectTypeOf<EnergySource>().toEqualTypeOf<Schemas["EnergySource"]>();
    expectTypeOf<YarnProcess>().toEqualTypeOf<Schemas["YarnProcess"]>();
    expectTypeOf<DyeProcess>().toEqualTypeOf<Schemas["DyeProcess"]>();
    expectTypeOf<ChemicalStandard>().toEqualTypeOf<Schemas["ChemicalStandard"]>();
  });

  it("correction presets mark fields of the step data", () => {
    type Field = (typeof import("./constants").CORRECTION_PRESETS)[number]["fields"][number];
    expectTypeOf<Field>().toExtend<keyof Schemas["StepData"]>();
  });

  it("supplier types are company types", () => {
    expectTypeOf<SupplierType>().toExtend<Schemas["SupplierCreateRequest"]["type"]>();
  });

  it("error codes are plain strings in the API", () => {
    expectTypeOf<FieldErrorCode>().toExtend<Schemas["FieldViolation"]["code"]>();
  });
});
