import { describe, expect, it } from "vitest";
import { initials } from "@/components/shell/user-menu";
import { safeNextPath } from "@/lib/auth/use-session";
import { pageKeyFromPath } from "@/lib/nav";
import { shortcutLabelFor } from "@/lib/platform";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/products")).toBe("/products");
    expect(safeNextPath("/batches?x=1")).toBe("/batches?x=1");
  });

  it("rejects anything that could leave the site or loop back to login", () => {
    for (const next of ["https://evil.example", "//evil.example", "/\\evil.example", "evil", "", null, "/login"]) {
      expect(safeNextPath(next)).toBe("/batches");
    }
  });
});

describe("shortcutLabelFor", () => {
  it("uses ⌘K on Apple platforms and Ctrl K elsewhere", () => {
    expect(shortcutLabelFor("macOS")).toBe("⌘K");
    expect(shortcutLabelFor("MacIntel")).toBe("⌘K");
    expect(shortcutLabelFor("iPhone")).toBe("⌘K");
    expect(shortcutLabelFor("Windows")).toBe("Ctrl K");
    expect(shortcutLabelFor("Win32")).toBe("Ctrl K");
    expect(shortcutLabelFor("Linux x86_64")).toBe("Ctrl K");
  });
});

describe("initials", () => {
  it("takes first and last name, Turkish upper case", () => {
    expect(initials("Elif Yılmaz")).toBe("EY");
    expect(initials("ilker su")).toBe("İS");
    expect(initials("Demo Yonetici")).toBe("DY");
    expect(initials("Ayşe Nur Kaya")).toBe("AK");
    expect(initials("Mehmet")).toBe("M");
  });
});

describe("pageKeyFromPath", () => {
  it("maps menu routes and ignores others", () => {
    expect(pageKeyFromPath("/batches")).toBe("batches");
    expect(pageKeyFromPath("/batches/123")).toBe("batches");
    expect(pageKeyFromPath("/login")).toBeUndefined();
  });
});
