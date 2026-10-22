import { describe, expect, it } from "vitest";
import { canManageSuppliers, canWriteCatalog, supplierRedirect } from "./permissions";

describe("canWriteCatalog", () => {
  it("lets owners, admins and editors write, viewers and suppliers not", () => {
    expect(["OWNER", "ADMIN", "EDITOR"].every((r) => canWriteCatalog(r as never))).toBe(true);
    expect(canWriteCatalog("VIEWER")).toBe(false);
    expect(canWriteCatalog("SUPPLIER")).toBe(false);
  });
});

describe("canManageSuppliers", () => {
  it("lets only owners and admins change the supplier network (PLAN §2); editors assign suppliers", () => {
    expect(canManageSuppliers("OWNER")).toBe(true);
    expect(canManageSuppliers("ADMIN")).toBe(true);
    expect(["EDITOR", "VIEWER", "SUPPLIER"].some((r) => canManageSuppliers(r as never))).toBe(false);
  });
});

describe("supplierRedirect", () => {
  it("sends suppliers from products and batches to their tasks", () => {
    expect(supplierRedirect("SUPPLIER", "/products")).toBe("/tasks");
    expect(supplierRedirect("SUPPLIER", "/batches/123")).toBe("/tasks");
    expect(supplierRedirect("SUPPLIER", "/tasks")).toBeUndefined();
    expect(supplierRedirect("SUPPLIER", "/productsx")).toBeUndefined();
    expect(supplierRedirect("VIEWER", "/products")).toBeUndefined();
  });
});
