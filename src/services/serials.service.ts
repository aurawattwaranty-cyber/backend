import { clone, createId, getDatabase, mutate } from "../data/store.js";
import type {
  BulkImportPreview,
  BulkImportResult,
  BulkImportRow,
  Paginated,
  ProductType,
  SerialNumber,
  SerialStatus,
  SerialValidationResult,
} from "../types.js";
import ExcelJS from "exceljs";
import { AppError } from "../utils/errors.js";
import { paginate } from "../utils/pagination.js";
import { buildSerialRecord, inferModelForSerial } from "./serial-mapping.js";
import {
  isSerialFormatValid,
  normaliseSerial,
  requiredText,
} from "../utils/validation.js";

const BULK_IMPORT_COLUMNS = [
  "serial_number",
  "model_name",
  "capacity_kw",
  "product_type",
] as const;

export const BULK_IMPORT_TEMPLATE = [
  BULK_IMPORT_COLUMNS.join(","),
  "AW-HI-5KW-24101,AuraWatt HybridPro 5kW,5,inverter",
  "AW-HI-10KW-24101,AuraWatt HybridMax 10kW,10,inverter",
  "AW-BT-51-24101,AuraWatt PowerCell 5.1kWh,5.1,battery",
].join("\n");

export function parseSerialQueryValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === "," || char === "\t") && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells.map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

export async function validateSerial(
  input: string,
): Promise<SerialValidationResult> {
  const serial = normaliseSerial(input);

  if (!serial) {
    throw new AppError(
      "Enter the serial number printed on your inverter.",
      400,
      "empty_serial",
    );
  }

  if (!isSerialFormatValid(serial)) {
    return {
      status: "unknown",
      serial: null,
      message:
        "That doesn't look like an Aurawatt serial number. Check the label on the side of your inverter and try again.",
    };
  }

  const record = getDatabase().serials.find((entry) => entry.serial === serial);

  if (!record) {
    const inferredModel = inferModelForSerial(serial, getDatabase().models);
    if (inferredModel) {
      return {
        status: "available",
        serial: buildSerialRecord(serial, inferredModel),
        message: `${inferredModel.name} verified and available for registration.`,
      };
    }
    return {
      status: "unknown",
      serial: null,
      message:
        "We couldn't verify this serial number. Please check the number and try again, or contact your installer.",
    };
  }

  if (record.status === "registered") {
    const result: SerialValidationResult = {
      status: "registered",
      serial: clone(record),
      message: record.warrantyId
        ? `This serial number is already registered under warranty ID ${record.warrantyId}. Use Check Status to view it.`
        : "This serial number has already been registered.",
    };
    if (record.warrantyId) {
      result.existingWarrantyId = record.warrantyId;
    }
    return result;
  }

  return {
    status: "available",
    serial: clone(record),
    message: `${record.modelName} verified and available for registration.`,
  };
}

export interface SerialQuery {
  search?: string;
  status?: SerialStatus | "all";
  page?: number;
  pageSize?: number;
}

export async function getSerials(
  query: SerialQuery = {},
): Promise<Paginated<SerialNumber>> {
  const { search = "", status = "all", page = 1, pageSize = 15 } = query;
  const term = search.trim().toLowerCase();

  const filtered = getDatabase()
    .serials.filter((serial) => {
      if (status !== "all" && serial.status !== status) return false;
      if (!term) return true;
      return (
        serial.serial.toLowerCase().includes(term) ||
        serial.modelName.toLowerCase().includes(term)
      );
    })
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt));

  return paginate(clone(filtered), page, pageSize);
}

export async function getSerialCounts(): Promise<{
  available: number;
  registered: number;
}> {
  const serials = getDatabase().serials;
  return {
    available: serials.filter((serial) => serial.status === "available").length,
    registered: serials.filter((serial) => serial.status === "registered").length,
  };
}

export interface CreateSerialInput {
  serial: string;
  modelId: string;
}

export async function createSerial(
  input: CreateSerialInput,
): Promise<SerialNumber> {
  const serial = normaliseSerial(requiredText(input.serial));

  if (!serial) {
    throw new AppError("Enter a serial number.", 400, "invalid_input");
  }
  if (!isSerialFormatValid(serial)) {
    throw new AppError(
      "Serial numbers use letters, numbers and dashes only, and must be at least 6 characters.",
      400,
      "invalid_format",
    );
  }

  const db = getDatabase();
  if (db.serials.some((entry) => entry.serial === serial)) {
    throw new AppError(
      `Serial number ${serial} already exists in the inventory.`,
      409,
      "duplicate_serial",
    );
  }

  const modelId = requiredText(input.modelId);
  const model = db.models.find((entry) => entry.id === modelId);
  if (!model) {
    throw new AppError("Select a product model.", 400, "invalid_model");
  }

  const record: SerialNumber = {
    id: createId("srl"),
    serial,
    modelId: model.id,
    modelName: model.name,
    capacityKw: model.capacityKw,
    productType: model.productType,
    status: "available",
    addedAt: new Date().toISOString(),
  };

  mutate((store) => store.serials.unshift(record));
  return clone(record);
}

/** Flattens one spreadsheet cell to the plain text the row parser expects. */
function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const cell = value as {
      text?: string;
      result?: unknown;
      richText?: { text?: string }[];
      hyperlink?: string;
    };
    if (Array.isArray(cell.richText)) {
      return cell.richText.map((part) => part.text ?? "").join("");
    }
    if (typeof cell.text === "string") return cell.text;
    if (cell.result !== undefined) return String(cell.result);
    return "";
  }
  return String(value);
}

/** Reads the first worksheet of an .xlsx/.xls upload into rows of cells. */
async function readWorkbookGrid(base64: string): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs ships its own Buffer typing, which no longer matches the one in
    // current @types/node. The runtime value is correct either way.
    const bytes = Buffer.from(base64, "base64") as unknown as Parameters<
      typeof workbook.xlsx.load
    >[0];
    await workbook.xlsx.load(bytes);
  } catch {
    throw new AppError(
      "That file could not be read as an Excel workbook. Re-save it as .xlsx and try again.",
      400,
      "unreadable_workbook",
    );
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new AppError("That workbook has no sheets.", 400, "empty_file");
  }

  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    // ExcelJS row.values is 1-indexed; index 0 is always empty.
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    const cells = values.map(cellToText);
    if (cells.some((cell) => cell.trim())) grid.push(cells);
  });
  return grid;
}

async function parseBulkImportContent(
  fileName: string,
  content: string,
  encoding: "text" | "base64",
): Promise<BulkImportPreview> {
  const name = fileName.toLowerCase();
  const isWorkbook = /\.(xlsx|xls)$/.test(name);

  if (!isWorkbook && !/\.(csv|tsv|txt)$/.test(name)) {
    throw new AppError(
      "Unsupported file type. Upload a .csv, .tsv, .txt, .xlsx or .xls file.",
      400,
      "unsupported_file",
    );
  }

  if (isWorkbook && encoding !== "base64") {
    throw new AppError(
      "Excel workbooks must be uploaded as binary content.",
      400,
      "invalid_encoding",
    );
  }

  const grid = isWorkbook
    ? await readWorkbookGrid(content)
    : content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map(splitCsvLine);

  if (grid.length === 0) {
    throw new AppError("That file is empty.", 400, "empty_file");
  }

  const header = (grid[0] ?? []).map((cell) =>
    cell.toLowerCase().replace(/[\s-]+/g, "_"),
  );
  const hasHeader = header.includes("serial_number") || header.includes("serial");
  if (!hasHeader) {
    throw new AppError(
      `The first row must be a header row: ${BULK_IMPORT_COLUMNS.join(", ")}.`,
      400,
      "missing_header",
    );
  }

  const columnIndex = (...names: string[]) =>
    names.map((entry) => header.indexOf(entry)).find((index) => index >= 0) ?? -1;

  const serialAt = columnIndex("serial_number", "serial");
  const modelAt = columnIndex("model_name", "model");
  const capacityAt = columnIndex("capacity_kw", "capacity");
  const typeAt = columnIndex("product_type", "type");

  const db = getDatabase();
  const seenInFile = new Set<string>();

  const rows: BulkImportRow[] = grid.slice(1).map((cells, index) => {
    const serial = normaliseSerial(cells[serialAt] ?? "");
    const modelName = (modelAt >= 0 ? cells[modelAt] : "")?.trim() ?? "";
    const capacityKw = (capacityAt >= 0 ? cells[capacityAt] : "")?.trim() ?? "";
    const productType = (
      (typeAt >= 0 ? cells[typeAt] : "")?.trim() || "inverter"
    ).toLowerCase();

    const row: BulkImportRow = {
      rowNumber: index + 2,
      serial,
      modelName,
      capacityKw,
      productType,
      valid: true,
    };

    if (!serial) {
      return { ...row, valid: false, error: "Serial number is missing" };
    }
    if (!isSerialFormatValid(serial)) {
      return { ...row, valid: false, error: "Serial number format is invalid" };
    }
    if (seenInFile.has(serial)) {
      return { ...row, valid: false, error: "Duplicate row in this file" };
    }
    seenInFile.add(serial);
    if (db.serials.some((entry) => entry.serial === serial)) {
      return { ...row, valid: false, error: "Already in the inventory" };
    }
    if (!modelName) {
      return { ...row, valid: false, error: "Model name is missing" };
    }
    const model = db.models.find(
      (entry) => entry.name.toLowerCase() === modelName.toLowerCase(),
    );
    if (!model) {
      return { ...row, valid: false, error: "Unknown product model" };
    }
    if (productType !== "inverter" && productType !== "battery") {
      return {
        ...row,
        valid: false,
        error: "Product type must be inverter or battery",
      };
    }

    return row;
  });

  if (rows.length === 0) {
    throw new AppError(
      "That file has a header row but no serial numbers.",
      400,
      "no_rows",
    );
  }

  return {
    fileName,
    rows,
    validCount: rows.filter((row) => row.valid).length,
    invalidCount: rows.filter((row) => !row.valid).length,
  };
}

export async function previewBulkImport(input: {
  fileName: string;
  content: string;
  encoding?: "text" | "base64";
}): Promise<BulkImportPreview> {
  return parseBulkImportContent(
    input.fileName,
    input.content,
    input.encoding === "base64" ? "base64" : "text",
  );
}

export async function bulkImportSerials(
  preview: BulkImportPreview,
): Promise<BulkImportResult> {
  const db = getDatabase();
  const errors: BulkImportResult["errors"] = [];
  const created: SerialNumber[] = [];

  preview.rows.forEach((row) => {
    if (!row.valid) {
      errors.push({
        rowNumber: row.rowNumber,
        serial: row.serial,
        error: row.error ?? "Row could not be imported",
      });
      return;
    }

    const model = db.models.find(
      (entry) => entry.name.toLowerCase() === row.modelName.toLowerCase(),
    );
    if (!model) {
      errors.push({
        rowNumber: row.rowNumber,
        serial: row.serial,
        error: "Unknown product model",
      });
      return;
    }

    created.push({
      id: createId("srl"),
      serial: row.serial,
      modelId: model.id,
      modelName: model.name,
      capacityKw: model.capacityKw,
      productType: model.productType,
      status: "available",
      addedAt: new Date().toISOString(),
    });
  });

  if (created.length > 0) {
    mutate((store) => store.serials.unshift(...created));
  }

  return { imported: created.length, failed: errors.length, errors };
}

export { normaliseSerial, isSerialFormatValid, BULK_IMPORT_COLUMNS };
