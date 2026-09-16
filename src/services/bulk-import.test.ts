import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

// Deliberately no `dotenv/config` import: without MONGODB_URI the store falls
// back to the local JSON file, so these tests never touch a real database.
// Every case below is preview-only and writes nothing.
import { getDatabase, initializeStore } from "../data/store.js";
import { createProductModel } from "./products.service.js";
import { createSerial } from "./serials.service.js";
import { previewBulkImport } from "./serials.service.js";

const HEADER = ["serial_number", "model_name", "capacity_kw", "product_type"];

const ROWS = [
  ["AW-HI-5KW-91001", "AuraWatt HybridPro 5kW", "5", "inverter"],
  ["AW-BT-51-91002", "AuraWatt PowerCell 5.1kWh", "5.1", "battery"],
  ["AW-HI-5KW-91001", "AuraWatt HybridPro 5kW", "5", "inverter"],
];

function toCsv(rows: string[][]): string {
  return [HEADER, ...rows].map((row) => row.join(",")).join("\n");
}

async function toXlsxBase64(rows: string[][]): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Serials");
  sheet.addRow(HEADER);
  rows.forEach((row) => sheet.addRow(row));
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString("base64");
}

describe("bulk serial import", () => {
  before(async () => {
    await initializeStore();
    // The local JSON store is shared between runs, so each fixture is created
    // only when missing. Creating them unconditionally made every case in this
    // file fail with a duplicate error, which in turn masked the assertions
    // below whenever the catalogue did not contain the models they reference.
    async function ensureModel(
      name: string,
      capacityKw: number,
      productType: "inverter" | "battery",
    ) {
      const existing = getDatabase().models.find((entry) => entry.name === name);
      if (existing) return existing;
      return createProductModel({
        series: name.split(" ").slice(0, 2).join(" "),
        name,
        capacityKw,
        productType,
        warrantyMonths: 60,
        active: true,
      });
    }

    const model = await ensureModel("AuraWatt HybridPro 3kW", 3, "inverter");
    // The fixture rows below are imported against these two.
    await ensureModel("AuraWatt HybridPro 5kW", 5, "inverter");
    await ensureModel("AuraWatt PowerCell 5.1kWh", 5.1, "battery");

    const serialExists = getDatabase().serials.some(
      (entry) => entry.serial === "AW-HI-3KW-24001",
    );
    if (!serialExists) {
      await createSerial({ serial: "AW-HI-3KW-24001", modelId: model.id });
    }
  });

  test("reads a CSV upload", async () => {
    const preview = await previewBulkImport({
      fileName: "serials.csv",
      content: toCsv(ROWS),
      encoding: "text",
    });
    assert.equal(preview.rows.length, 3);
    assert.equal(preview.validCount, 2);
    assert.equal(preview.invalidCount, 1);
  });

  test("reads an .xlsx workbook", async () => {
    const preview = await previewBulkImport({
      fileName: "serials.xlsx",
      content: await toXlsxBase64(ROWS),
      encoding: "base64",
    });
    assert.equal(preview.rows.length, 3);
    assert.equal(preview.validCount, 2);
    assert.equal(preview.invalidCount, 1);
  });

  test("CSV and Excel produce identical rows", async () => {
    const csv = await previewBulkImport({
      fileName: "serials.csv",
      content: toCsv(ROWS),
      encoding: "text",
    });
    const xlsx = await previewBulkImport({
      fileName: "serials.xlsx",
      content: await toXlsxBase64(ROWS),
      encoding: "base64",
    });
    assert.deepEqual(xlsx.rows, csv.rows);
  });

  test("flags a serial that is already in the inventory", async () => {
    const preview = await previewBulkImport({
      fileName: "serials.xlsx",
      content: await toXlsxBase64([
        ["AW-HI-3KW-24001", "AuraWatt HybridPro 3kW", "3", "inverter"],
      ]),
      encoding: "base64",
    });
    assert.equal(preview.rows[0]?.valid, false);
    assert.match(preview.rows[0]?.error ?? "", /already in the inventory/i);
  });

  test("flags a duplicate appearing twice in one file", async () => {
    const preview = await previewBulkImport({
      fileName: "serials.xlsx",
      content: await toXlsxBase64([ROWS[0]!, ROWS[0]!]),
      encoding: "base64",
    });
    assert.equal(preview.rows[0]?.valid, true);
    assert.equal(preview.rows[1]?.valid, false);
    assert.match(preview.rows[1]?.error ?? "", /duplicate/i);
  });

  test("flags an unknown product model", async () => {
    const preview = await previewBulkImport({
      fileName: "serials.xlsx",
      content: await toXlsxBase64([
        ["AW-HI-5KW-91009", "AuraWatt NotARealModel", "5", "inverter"],
      ]),
      encoding: "base64",
    });
    assert.equal(preview.rows[0]?.valid, false);
  });

  test("rejects a workbook sent as text", async () => {
    await assert.rejects(
      previewBulkImport({
        fileName: "serials.xlsx",
        content: toCsv(ROWS),
        encoding: "text",
      }),
      /binary/i,
    );
  });

  test("rejects content that is not a workbook at all", async () => {
    await assert.rejects(
      previewBulkImport({
        fileName: "serials.xlsx",
        content: Buffer.from("this is not a zip archive").toString("base64"),
        encoding: "base64",
      }),
      /could not be read/i,
    );
  });

  test("rejects an unsupported extension", async () => {
    await assert.rejects(
      previewBulkImport({
        // .pdf, .doc and .docx are accepted uploads, so this asserts the
        // rejection with a type the importer genuinely does not handle.
        fileName: "serials.zip",
        content: "anything",
        encoding: "text",
      }),
      /unsupported file type/i,
    );
  });

  test("rejects a file with no header row", async () => {
    await assert.rejects(
      previewBulkImport({
        fileName: "serials.csv",
        content: ROWS.map((row) => row.join(",")).join("\n"),
        encoding: "text",
      }),
      /header row/i,
    );
  });

  test("rejects an empty upload", async () => {
    await assert.rejects(
      previewBulkImport({ fileName: "serials.csv", content: "", encoding: "text" }),
      /empty/i,
    );
  });
});
