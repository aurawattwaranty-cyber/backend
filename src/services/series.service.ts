import { clone, createId, getDatabase, mutate } from "../data/store.js";
import type {
  ProductModel,
  ProductSeries,
  ProductType,
  SerialImportFile,
  SeriesWithModels,
} from "../types.js";
import { AppError } from "../utils/errors.js";
import { requiredText } from "../utils/validation.js";

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * A model belongs to a series by id. Catalogue rows created before models
 * carried a `seriesId` still fall back to a name match, which is the same rule
 * `approveWarranty` uses to scope model choices to a serial's series — so the
 * terms shown on the uploader page are exactly the terms an activation
 * applies.
 */
export function modelBelongsToSeries(
  model: ProductModel,
  series: ProductSeries,
): boolean {
  return model.seriesId
    ? model.seriesId === series.id
    : sameName(model.series, series.name);
}

export async function getSeries(): Promise<{
  series: SeriesWithModels[];
  files: SerialImportFile[];
  /** Catalogue models with no uploaded series of the same name. */
  unmatchedModels: ProductModel[];
}> {
  const db = getDatabase();
  const byCapacity = (a: ProductModel, b: ProductModel) =>
    a.capacityKw - b.capacityKw || a.name.localeCompare(b.name);

  const series = db.series.map((entry) => ({
    ...clone(entry),
    models: clone(
      db.models.filter((model) => modelBelongsToSeries(model, entry)),
    ).sort(byCapacity),
  }));

  const unmatchedModels = clone(
    db.models.filter(
      (model) => !db.series.some((entry) => modelBelongsToSeries(model, entry)),
    ),
  ).sort((a, b) => a.series.localeCompare(b.series) || byCapacity(a, b));

  return { series, files: clone(db.serialImportFiles), unmatchedModels };
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
  await mutate((db) => db.series.push(record));
  return clone(record);
}

export function getSeriesOrThrow(seriesId: string): ProductSeries {
  const series = getDatabase().series.find((entry) => entry.id === seriesId);
  if (!series) throw new AppError("Select a valid product series.", 400, "invalid_series");
  return series;
}

export async function deleteSeries(
  seriesId: string,
  confirmationName: string,
): Promise<boolean> {
  const db = getDatabase();
  const series = getSeriesOrThrow(seriesId);
  if (confirmationName.trim() !== series.name) {
    throw new AppError("Type the exact series name to confirm deletion.", 400, "confirmation_mismatch");
  }

  const serials = db.serials.filter((entry) => entry.seriesId === seriesId);
  if (serials.some((entry) => entry.status === "registered" || entry.warrantyId)) {
    throw new AppError("This series has registered warranties and cannot be deleted.", 409, "series_in_use");
  }

  await mutate((store) => {
    store.series = store.series.filter((entry) => entry.id !== seriesId);
    store.serialImportFiles = store.serialImportFiles.filter((entry) => entry.seriesId !== seriesId);
    store.serials = store.serials.filter((entry) => entry.seriesId !== seriesId);
  });
  return true;
}

/**
 * Gives catalogue models that name a series no series record exists for a real
 * home, so everything sits under Series → Model → Warranty period.
 *
 * Seed models carry a series *name* only. Until a series of that name is
 * created the models float outside the hierarchy: their terms still apply at
 * activation, but nothing can be uploaded against them and they cannot be
 * managed alongside their siblings. This creates the missing series from the
 * models themselves and binds them.
 *
 * Idempotent — models already bound to a series are left alone, so it is safe
 * to run again after a series is deleted and orphans its models.
 */
export async function adoptOrphanModels(): Promise<{
  createdSeries: ProductSeries[];
  attachedModels: number;
  skipped: { series: string; reason: string }[];
}> {
  const createdSeries: ProductSeries[] = [];
  const skipped: { series: string; reason: string }[] = [];
  let attachedModels = 0;

  await mutate((db) => {
    createdSeries.length = 0;
    skipped.length = 0;
    attachedModels = 0;

    const orphans = db.models.filter(
      (model) => !db.series.some((series) => modelBelongsToSeries(model, series)),
    );

    const groups = new Map<string, ProductModel[]>();
    orphans.forEach((model) => {
      const name = model.series.trim();
      if (!name) {
        skipped.push({ series: model.name, reason: "The model names no series." });
        return;
      }
      const group = groups.get(name);
      if (group) group.push(model);
      else groups.set(name, [model]);
    });

    groups.forEach((models, name) => {
      // A series fixes the product type of everything uploaded into it, so a
      // group that disagrees with itself needs a person to resolve it.
      const productTypes = new Set(models.map((model) => model.productType));
      if (productTypes.size > 1) {
        skipped.push({
          series: name,
          reason: `Its models are a mix of ${[...productTypes].join(" and ")}.`,
        });
        return;
      }

      const existing = db.series.find(
        (entry) => entry.name.trim().toLowerCase() === name.toLowerCase(),
      );
      const series =
        existing ??
        ({
          id: createId("ser"),
          name,
          productType: [...productTypes][0] ?? "inverter",
          active: true,
          createdAt: new Date().toISOString(),
        } satisfies ProductSeries);

      if (!existing) {
        db.series.push(series);
        createdSeries.push(series);
      }

      models.forEach((model) => {
        const stored = db.models.find((entry) => entry.id === model.id);
        if (!stored) return;
        stored.seriesId = series.id;
        stored.series = series.name;
        attachedModels += 1;
      });
    });
  });

  return { createdSeries: clone(createdSeries), attachedModels, skipped };
}
