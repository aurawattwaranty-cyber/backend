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
  const series = requiredText(input.series);
  if (!name) throw new AppError("Enter a model name.", 400, "invalid_input");
  if (!series) throw new AppError("Enter a product series.", 400, "invalid_input");

  const duplicate = getDatabase().models.some(
    (model) => model.name.toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) {
    throw new AppError(`The model "${name}" already exists.`, 409, "duplicate_model");
  }

  const model: ProductModel = {
    id: createId("mdl"),
    series,
    name,
    capacityKw: input.capacityKw,
    productType: input.productType,
    warrantyMonths: normaliseWarrantyMonths(input.warrantyMonths),
    active: input.active,
    createdAt: new Date().toISOString(),
  };

  mutate((db) => db.models.push(model));
  return clone(model);
}

export async function updateProductModel(
  id: string,
  input: Partial<ProductModelInput>,
): Promise<ProductModel> {
  const updated = mutate((db) => {
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
