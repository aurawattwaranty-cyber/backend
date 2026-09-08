import { clone, createId, getDatabase, mutate } from "../data/store.js";
import type { ProductSeries, ProductType, SerialImportFile } from "../types.js";
import { AppError } from "../utils/errors.js";
import { requiredText } from "../utils/validation.js";

export async function getSeries(): Promise<{
  series: ProductSeries[];
  files: SerialImportFile[];
}> {
  const db = getDatabase();
  return { series: clone(db.series), files: clone(db.serialImportFiles) };
}

export async function createSeries(input: { name: string; productType?: ProductType }): Promise<ProductSeries> {
  const name = requiredText(input.name);
  if (!name) throw new AppError("Enter a series name.", 400, "invalid_input");
  const productType = input.productType;
  if (productType !== "inverter" && productType !== "battery" && productType !== "combo") {
    throw new AppError("Select whether these are inverter, battery or all-in-one serials.", 400, "invalid_product_type");
  }
  if (getDatabase().series.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) {
    throw new AppError(`The series "${name}" already exists.`, 409, "duplicate_series");
  }
  const record: ProductSeries = {
    id: createId("ser"),
    name,
    productType,
    active: true,
    createdAt: new Date().toISOString(),
  };
  mutate((db) => db.series.push(record));
  return clone(record);
}

export function getSeriesOrThrow(seriesId: string): ProductSeries {
  const series = getDatabase().series.find((entry) => entry.id === seriesId);
  if (!series) throw new AppError("Select a valid product series.", 400, "invalid_series");
  return series;
}

export function deleteSeries(seriesId: string, confirmationName: string): boolean {
  const db = getDatabase();
  const series = getSeriesOrThrow(seriesId);
  if (confirmationName.trim() !== series.name) {
    throw new AppError("Type the exact series name to confirm deletion.", 400, "confirmation_mismatch");
  }

  const serials = db.serials.filter((entry) => entry.seriesId === seriesId);
  if (serials.some((entry) => entry.status === "registered" || entry.warrantyId)) {
    throw new AppError("This series has registered warranties and cannot be deleted.", 409, "series_in_use");
  }

  mutate((store) => {
    store.series = store.series.filter((entry) => entry.id !== seriesId);
    store.serialImportFiles = store.serialImportFiles.filter((entry) => entry.seriesId !== seriesId);
    store.serials = store.serials.filter((entry) => entry.seriesId !== seriesId);
  });
  return true;
}
