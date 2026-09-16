import { clone, createId, getDatabase, mutate } from "../data/store.js";
import type { ProductModel, ProductModelInput, ProductType } from "../types.js";
import { AppError } from "../utils/errors.js";
import { requiredText } from "../utils/validation.js";

const MAX_WARRANTY_MONTHS = 600;

/**
 * The warranty term drives every activation, so it is validated here rather
 * than at the point a warranty is approved.
 */
function normaliseWarrantyMonths(value: unknown): number {
  const months = typeof value === "string" ? Number(value) : value;
  if (typeof months !== "number" || !Number.isFinite(months)) {
    throw new AppError("Enter the warranty term in months.", 400, "invalid_warranty_months");
  }
  const rounded = Math.round(months);
  if (rounded < 1 || rounded > MAX_WARRANTY_MONTHS) {
    throw new AppError(
      `Enter a warranty term between 1 and ${MAX_WARRANTY_MONTHS} months.`,
      400,
      "invalid_warranty_months",
    );
  }
  return rounded;
}

export async function getProductModels(options?: {
  activeOnly?: boolean;
  productType?: ProductType;
}): Promise<ProductModel[]> {
  let models = clone(getDatabase().models);
  if (options?.activeOnly) models = models.filter((model) => model.active);
  if (options?.productType) {
    models = models.filter((model) => model.productType === options.productType);
  }
  return models.sort(
    (a, b) => a.series.localeCompare(b.series) || a.capacityKw - b.capacityKw,
  );
}

export async function getProductSeries(): Promise<string[]> {
  return [...new Set(getDatabase().models.map((model) => model.series))].sort();
}

export async function createProductModel(
  input: ProductModelInput,
): Promise<ProductModel> {
  const name = requiredText(input.name);
  if (!name) throw new AppError("Enter a model name.", 400, "invalid_input");

  const seriesId = requiredText(input.seriesId);
  const db = getDatabase();
  // A model belongs to a series record when one is named; the loose `series`
  // string stays supported for catalogue rows created outside the uploader.
  const owner = seriesId
    ? db.series.find((entry) => entry.id === seriesId)
    : undefined;
  if (seriesId && !owner) {
    throw new AppError("Select a valid product series.", 400, "invalid_series");
  }

  const series = owner?.name ?? requiredText(input.series);
  if (!series) {
    throw new AppError("Enter a product series.", 400, "invalid_input");
  }

  const capacityKw = Number(input.capacityKw);
  if (!Number.isFinite(capacityKw) || capacityKw <= 0) {
    throw new AppError("Enter the model capacity.", 400, "invalid_capacity");
  }

  const duplicate = db.models.some(
    (model) => model.name.toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) {
    throw new AppError(`The model "${name}" already exists.`, 409, "duplicate_model");
  }

  const model: ProductModel = {
    id: createId("mdl"),
    ...(owner ? { seriesId: owner.id } : {}),
    series,
    name,
    capacityKw,
    // A series fixes the product type of everything under it, so a model added
    // there inherits it rather than letting the two disagree.
    productType: owner?.productType ?? input.productType ?? "inverter",
    warrantyMonths: normaliseWarrantyMonths(input.warrantyMonths),
    active: input.active ?? true,
    createdAt: new Date().toISOString(),
  };

  await mutate((store) => store.models.push(model));
  return clone(model);
}

export async function deleteProductModel(id: string): Promise<void> {
  await mutate((db) => {
    const model = db.models.find((entry) => entry.id === id);
    if (!model) {
      throw new AppError("That product model no longer exists.", 404, "not_found");
    }
    const inUse = db.registrations.some(
      (registration) => registration.modelId === id,
    );
    if (inUse) {
      throw new AppError(
        "This model is used by a registered warranty and cannot be deleted.",
        409,
        "model_in_use",
      );
    }
    db.models = db.models.filter((entry) => entry.id !== id);
    // Serials keep their series; only the model assignment is cleared.
    db.serials.forEach((serial) => {
      if (serial.modelId !== id) return;
      serial.modelId = "";
      serial.modelName = "";
    });
  });
}

export async function updateProductModel(
  id: string,
  input: Partial<ProductModelInput>,
): Promise<ProductModel> {
  const updated = await mutate((db) => {
    const model = db.models.find((entry) => entry.id === id);
    if (!model) {
      throw new AppError("That product model no longer exists.", 404, "not_found");
    }

    if (input.series !== undefined) {
      const series = requiredText(input.series);
      if (!series) {
        throw new AppError("Enter a product series.", 400, "invalid_input");
      }
      model.series = series;
    }
    if (input.name !== undefined) {
      const name = requiredText(input.name);
      if (!name) {
        throw new AppError("Enter a model name.", 400, "invalid_input");
      }
      model.name = name;
    }
    if (input.capacityKw !== undefined) model.capacityKw = input.capacityKw;
    if (input.productType !== undefined) model.productType = input.productType;
    if (input.warrantyMonths !== undefined) {
      model.warrantyMonths = normaliseWarrantyMonths(input.warrantyMonths);
    }
    if (input.active !== undefined) model.active = input.active;

    db.serials.forEach((serial) => {
      if (serial.modelId !== id) return;
      serial.modelName = model.name;
      serial.capacityKw = model.capacityKw;
      serial.productType = model.productType;
    });

    return model;
  });

  return clone(updated);
}
