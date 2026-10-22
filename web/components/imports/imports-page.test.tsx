import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportResponse } from "@/lib/api/imports";
import { ApiError } from "@/lib/api/request";
import { renderWithIntl } from "@/test/render";

const state = vi.hoisted(() => ({
  role: "OWNER" as string,
  search: "",
  replace: vi.fn(),
  history: { data: [] as unknown[], isPending: false, isError: false, refetch: () => {} },
  selected: { data: undefined as unknown, isPending: false, isError: false, refetch: () => {} },
  start: { mutate: vi.fn(), isPending: false },
  download: vi.fn<(language: string) => Promise<void>>(() => Promise.resolve()),
}));

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace }),
  usePathname: () => "/imports",
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@/lib/auth/use-session", () => ({ useSession: () => ({ status: "authenticated", user: { role: state.role } }) }));
vi.mock("@/lib/api/imports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/imports")>()),
  useImports: () => state.history,
  useImport: () => state.selected,
  useStartImport: () => state.start,
  downloadTemplate: (language: string) => state.download(language),
}));

import { ImportsPage } from "./imports-page";

const job = (over: Partial<ImportResponse> = {}): ImportResponse => ({
  id: "i1",
  kind: "PRODUCTS",
  fileName: "urunler_ekim.xlsx",
  fileSize: 86_000,
  status: "DONE",
  totalRows: 50,
  createdRows: 45,
  failedRows: 5,
  errors: [],
  failureCode: null,
  createdByName: "Elif Yılmaz",
  createdAt: "2026-10-22T11:32:00Z",
  finishedAt: "2026-10-22T11:33:00Z",
  ...over,
});

const err = (row: number, column: string, code: string, value: string | null, detail: string | null = null) => ({ row, column, code, value, detail });

beforeEach(() => {
  state.role = "OWNER";
  state.search = "";
  state.replace = vi.fn();
  state.history = { data: [], isPending: false, isError: false, refetch: () => {} };
  state.selected = { data: undefined, isPending: false, isError: false, refetch: () => {} };
  state.start = { mutate: vi.fn(), isPending: false };
  state.download = vi.fn<(language: string) => Promise<void>>(() => Promise.resolve());
});

const dropzone = () => screen.getByRole("button", { name: "İçe aktarılacak Excel dosyası" });
const drop = (file: File) => fireEvent.drop(dropzone(), { dataTransfer: { files: [file] } });

describe("ImportsPage (design v1.1 150–156)", () => {
  it("explains the three steps the first time and downloads the template in the panel's language", async () => {
    const user = userEvent.setup();
    renderWithIntl(<ImportsPage />);

    expect(screen.getByRole("heading", { name: "Excel’den içe aktar" })).toBeInTheDocument();
    expect(screen.getByText("Şablonu indirin")).toBeInTheDocument();
    expect(screen.getByText(/şu an Türkçe/)).toBeInTheDocument();
    expect(screen.getByText("Dosyayı buraya bırakın ya da bilgisayardan seçin")).toBeInTheDocument();
    expect(screen.getByText("Yalnızca KozaPass şablonu · .xlsx · en fazla 1 MB ve 1000 satır")).toBeInTheDocument();
    expect(screen.getByText(/Henüz içe aktarma yok/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Şablonu indir (.xlsx)" }));
    expect(state.download).toHaveBeenCalledWith("tr");
  });

  it("refuses what is not an .xlsx of at most 1 MB before sending it, in one sentence", () => {
    renderWithIntl(<ImportsPage />);

    drop(new File(["a"], "urunler_ekim.csv"));
    expect(screen.getByRole("alert")).toHaveTextContent("Yalnızca .xlsx dosyaları yüklenebilir; “urunler_ekim.csv” bu biçimde değil.");
    drop(new File(["a"], "urunler.xlsm"));
    expect(screen.getByRole("alert")).toHaveTextContent("Makro içeren dosyalar (.xlsm) yüklenmez");
    drop(new File([new Uint8Array(2_500_000)], "buyuk.xlsx"));
    expect(screen.getByRole("alert")).toHaveTextContent("“buyuk.xlsx” 2,4 MB; en fazla 1 MB yüklenebilir.");
    expect(state.start.mutate).not.toHaveBeenCalled();
  });

  it("sends a template, opens its import, and says what the server refused", () => {
    renderWithIntl(<ImportsPage />);

    drop(new File(["a"], "urunler.xlsx"));
    const [file, options] = state.start.mutate.mock.calls[0] as [File, { onSuccess: (j: ImportResponse) => void; onError: (e: unknown) => void }];
    expect(file.name).toBe("urunler.xlsx");
    act(() => options.onSuccess(job({ id: "new" })));
    expect(state.replace).toHaveBeenCalledWith("/imports?id=new", { scroll: false });

    act(() => options.onError(new ApiError(400, { type: "x", title: "x", status: 400, errors: [{ field: "file", code: "FileUnsafe" }] } as never)));
    expect(screen.getByRole("alert")).toHaveTextContent("“urunler.xlsx” güvenlik taramasından geçemedi ve yüklenmedi.");
    expect(within(screen.getByRole("alert")).getByRole("button", { name: "Şablonu yeniden indir" })).toBeInTheDocument();
  });

  it("shows the import while it runs and that the page may be left", () => {
    state.search = "id=i1";
    state.selected = { ...state.selected, data: job({ status: "RUNNING", createdRows: 0, failedRows: 0, finishedAt: null }) };
    renderWithIntl(<ImportsPage />);

    expect(screen.getByRole("status")).toHaveTextContent("İşleniyor…");
    expect(screen.getByText("84 KB · Elif Yılmaz · 22 Eki 2026, 14:32")).toBeInTheDocument();
    expect(screen.getByText(/Sayfadan ayrılabilirsiniz/)).toBeInTheDocument();
  });

  it("lists the rows with errors as the template names the columns, with a hint to fix each (153a/b)", () => {
    state.search = "id=i1";
    const errors = [
      err(4, "gtin", "GtinCheckDigit", "8690123456781", "4"),
      err(4, "percent1", "Integer", "62,5"),
      err(9, "name", "NotBlank", null),
      err(17, "category", "UnknownValue", "Tişört"),
      err(17, "fibers", "FiberTotal", "60 + 30", "90"),
      err(23, "fiber2", "NotNull", null, "20"),
      err(31, "gtin", "Duplicate", "8690123456798", "12"),
      err(33, "gtin", "Unique", "8690123450012", "Basic tişört beyaz"),
    ];
    state.selected = { ...state.selected, data: job({ errors, failedRows: 8 }) };
    state.history = { ...state.history, data: [job({ errors: [] })] };
    renderWithIntl(<ImportsPage />);

    expect(screen.getByText("45 ürün oluşturuldu")).toBeInTheDocument();
    expect(screen.getByText("8 satır hatalı")).toBeInTheDocument();
    expect(screen.getByText(/Düzeltip yeniden yükleyin; oluşan ürünler atlanır./)).toBeInTheDocument();
    expect(screen.getByText("8 hata · satır numaraları Excel’deki gibidir, başlık 1. satır")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Hatalı satırlar" });
    const rows = within(table).getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(rows).toEqual([
      "4GTIN8690123456781Kontrol hanesi hatalıSon hane 4 olmalı",
      "4Lif 1 %62,5Tam sayı değil",
      "9Ürün adı(boş)Ürün adı boş",
      "17KategoriTişörtListede olmayan değerŞablondaki listeden seçin",
      "17Lif bileşimi%60 + %30Lif toplamı %100 değilToplam %90",
      "23Lif 2(boş)Lif seçilmemişLif 2 % dolu: 20",
      "31GTIN8690123456798Dosyada iki kez12. satırla aynı",
      "33GTIN8690123450012Bu GTIN zaten kayıtlıÜrün: Basic tişört beyaz",
    ]);
    // A row's second error leaves its number out (drawn, but invisible).
    expect(within(table).getAllByRole("row")[2].firstElementChild).toHaveClass("text-transparent");
    // Rows beyond the kept errors are counted: 6 rows are listed of the 8 that failed.
    expect(screen.getByText("…ve 2 satır daha.")).toBeInTheDocument();
  });

  it("says why a whole file was refused and that nothing was created", () => {
    state.search = "id=i1";
    state.selected = { ...state.selected, data: job({ status: "FAILED", failureCode: "TEMPLATE_UNKNOWN", createdRows: 0, failedRows: 0, fileName: "fiyat_listesi.xlsx" }) };
    renderWithIntl(<ImportsPage />);

    expect(screen.getByText("İçe aktarma başarısız · hiçbir ürün oluşturulmadı")).toBeInTheDocument();
    expect(screen.getByText(/Bu dosya KozaPass şablonu değil/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Şablonu indir (.xlsx)" })).toBeInTheDocument();
  });

  it("lists the latest imports with their state and opens one on click", async () => {
    const user = userEvent.setup();
    state.history = {
      ...state.history,
      data: [
        job({ id: "a" }),
        job({ id: "b", fileName: "yeni_sezon_ss27.xlsx", createdRows: 50, failedRows: 0 }),
        job({ id: "c", fileName: "fiyat_listesi.xlsx", status: "FAILED", failureCode: "TEMPLATE_UNKNOWN", createdRows: 0, failedRows: 0 }),
      ],
    };
    renderWithIntl(<ImportsPage />);

    const table = screen.getByRole("table", { name: "Son içe aktarmalar" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[3].textContent)).toEqual(["Kısmen başarılı", "Tamamlandı", "Başarısız"]);
    expect(rows[2]).toHaveTextContent("KozaPass şablonu değil");
    expect(rows[2]).toHaveTextContent("— / —");
    // With imports behind it, the upload card is the short one.
    expect(screen.getByText("Şablonu indirin · Doldurun · Yükleyin.")).toBeInTheDocument();

    await user.click(rows[1]);
    expect(state.replace).toHaveBeenCalledWith("/imports?id=b", { scroll: false });
  });

  it("lets a viewer read the history but not download or upload (156)", () => {
    state.role = "VIEWER";
    state.history = { ...state.history, data: [job()] };
    renderWithIntl(<ImportsPage />);

    expect(screen.getByText("Yükleme için Düzenleyici, Yönetici ya da Sahip rolü gerekir")).toBeInTheDocument();
    expect(dropzone()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Şablonu indir (.xlsx)" })).toHaveAttribute("aria-disabled", "true");
    drop(new File(["a"], "urunler.xlsx"));
    expect(state.start.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("table", { name: "Son içe aktarmalar" })).toBeInTheDocument();
  });
});
