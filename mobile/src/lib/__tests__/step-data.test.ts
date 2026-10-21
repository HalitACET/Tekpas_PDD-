import i18n from "../i18n";
import { dataRows } from "../step-data";

beforeAll(async () => {
  await i18n.changeLanguage("tr");
});

describe("dataRows", () => {
  it("shows a yarn step's data with its shares, only what was filled in", () => {
    const rows = dataRows(
      {
        fiberComposition: [
          { fiber: "ORGANIC_COTTON", percent: 95 },
          { fiber: "ELASTANE", percent: 5 },
        ],
        yarnCount: "Ne 30/1",
        yarnProcess: "COMBED",
        originCountry: "TR",
        originRegion: "Şanlıurfa",
        energyKwhPerKg: 2.4,
        energySources: [
          { source: "GRID", percent: 60 },
          { source: "SOLAR", percent: 40 },
        ],
        deliveredKg: 1200,
      },
      i18n.t.bind(i18n),
    );

    expect(rows.map((r) => r.key)).toEqual(["fibers", "yarn", "origin", "energy", "delivered"]);
    expect(rows[0]).toMatchObject({ label: "Lif bileşimi", value: "%95 / %5", mono: true });
    expect(rows[0].shares?.map((s) => s.label)).toEqual(["Organik pamuk %95", `${i18n.t("enums.fiber.ELASTANE")} %5`]);
    expect(rows[1].value).toBe(`Ne 30/1 · ${i18n.t("enums.yarnProcess.COMBED")}`);
    expect(rows[2].value).toMatch(/Şanlıurfa$/);
    expect(rows[3].value).toBe("2,4 kWh/kg");
    expect(rows[3].shares).toHaveLength(2);
    expect(rows[4].value).toBe("1.200 kg");
  });

  it("names a dyeing step's process and standards", () => {
    const rows = dataRows(
      { dyeProcess: "REACTIVE", chemicalStandards: ["ZDHC_MRSL", "OEKO_TEX_ECO_PASSPORT"], waterLPerKg: 62 },
      i18n.t.bind(i18n),
    );

    expect(rows.map((r) => [r.key, r.value])).toEqual([
      ["dye", i18n.t("enums.dyeProcess.REACTIVE")],
      ["chemicals", `${i18n.t("enums.chemicalStandard.ZDHC_MRSL")} · ${i18n.t("enums.chemicalStandard.OEKO_TEX_ECO_PASSPORT")}`],
      ["water", "62 l/kg"],
    ]);
  });
});
